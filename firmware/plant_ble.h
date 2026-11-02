// BLE advertisement parsing and buffering for the plant gateway.
//
// Collects the latest values of every Flower Care (HHCCJCY01) and Govee H5075 in range,
// keyed by MAC, and serializes them as JSON for the Supabase `ingest` function.
// No ESPHome includes, so the same file compiles in the unit tests (firmware/test/).

#pragma once

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <map>
#include <string>

namespace plant_ble {

enum class SensorType { FLOWER_CARE, HYGROMETER };

struct Reading {
  SensorType type = SensorType::FLOWER_CARE;
  // NAN = not received since the last send.
  float moisture = NAN;
  float temperature = NAN;
  float light = NAN;
  float conductivity = NAN;
  float humidity = NAN;
  float battery = NAN;
  int rssi = 0;
  bool fresh = false;
};

// Ignore new MACs beyond this, so a crowded neighbourhood can't exhaust RAM.
static constexpr size_t MAX_SENSORS = 32;

static constexpr uint16_t MIBEACON_PRODUCT_HHCCJCY01 = 0x0098;

// Xiaomi MiBeacon service data (UUID 0xFE95), unencrypted, as sent by the Flower Care.
// Layout: frame control (2, LE), product id (2, LE), frame counter (1), MAC (6),
// [capability (1)], then objects: type (2, LE), length (1), value (length, LE).
// Each advertisement usually carries a single object; values accumulate in `r`.
inline bool parse_mibeacon(const uint8_t *d, size_t len, Reading &r) {
  if (len < 5) return false;
  const uint16_t frame_control = d[0] | (d[1] << 8);
  const bool has_object = frame_control & 0x0040;
  const bool has_capability = frame_control & 0x0020;
  const bool encrypted = frame_control & 0x0008;
  const uint16_t product = d[2] | (d[3] << 8);
  if (product != MIBEACON_PRODUCT_HHCCJCY01 || !has_object || encrypted) return false;

  size_t pos = has_capability ? 12 : 11;
  bool parsed = false;
  while (pos + 3 <= len) {
    const uint16_t type = d[pos] | (d[pos + 1] << 8);
    const uint8_t vlen = d[pos + 2];
    const uint8_t *v = d + pos + 3;
    if (vlen < 1 || vlen > 4 || pos + 3 + vlen > len) break;

    if (type == 0x1004 && vlen == 2) {
      r.temperature = static_cast<int16_t>(v[0] | (v[1] << 8)) / 10.0f;
    } else if (type == 0x1007 && vlen == 3) {
      r.light = static_cast<float>(v[0] | (v[1] << 8) | (static_cast<uint32_t>(v[2]) << 16));
    } else if (type == 0x1008 && vlen == 1) {
      r.moisture = v[0];
    } else if (type == 0x1009 && vlen == 2) {
      r.conductivity = static_cast<float>(v[0] | (v[1] << 8));
    } else if (type == 0x100A && vlen == 1) {
      r.battery = v[0];  // older firmware only; 3.2.1+ no longer reports battery
    } else {
      pos += 3 + vlen;
      continue;
    }
    parsed = true;
    pos += 3 + vlen;
  }
  return parsed;
}

static constexpr uint16_t GOVEE_COMPANY_ID = 0xEC88;

// Govee H5075 manufacturer data (company id 0xEC88, id itself not included in `d`).
// Layout: 0x00, value (3, BE), battery (1), 0x00.
// value: bit 23 = negative temperature; temp = (value / 1000) / 10 °C, humidity = (value % 1000) / 10 %.
inline bool parse_govee_h5075(const uint8_t *d, size_t len, Reading &r) {
  if (len != 6) return false;
  uint32_t value = (static_cast<uint32_t>(d[1]) << 16) | (d[2] << 8) | d[3];
  const bool negative = value & 0x800000;
  value &= 0x7FFFFF;
  const float temperature = (value / 1000) / 10.0f;
  r.temperature = negative ? -temperature : temperature;
  r.humidity = (value % 1000) / 10.0f;
  r.battery = d[4] & 0x7F;
  return true;
}

inline std::string format_mac(const uint8_t *mac) {
  char buf[18];
  snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return buf;
}

class Store {
 public:
  // Device must provide address() (6 bytes, printable order), get_rssi(),
  // get_service_datas() and get_manufacturer_datas() with .uuid.contains(a, b) and .data.
  // Templated so the unit tests can pass a fake instead of esp32_ble_tracker::ESPBTDevice.
  template<typename Device> void on_advertise(const Device &dev) {
    for (const auto &sd : dev.get_service_datas()) {
      if (sd.uuid.contains(0x95, 0xFE)) {
        Reading parsed;
        if (parse_mibeacon(sd.data.data(), sd.data.size(), parsed))
          this->merge_(dev.address(), dev.get_rssi(), SensorType::FLOWER_CARE, parsed);
      }
    }
    for (const auto &md : dev.get_manufacturer_datas()) {
      if (md.uuid.contains(GOVEE_COMPANY_ID & 0xFF, GOVEE_COMPANY_ID >> 8)) {
        Reading parsed;
        if (parse_govee_h5075(md.data.data(), md.data.size(), parsed))
          this->merge_(dev.address(), dev.get_rssi(), SensorType::HYGROMETER, parsed);
      }
    }
  }

  size_t fresh_count() const {
    size_t n = 0;
    for (const auto &it : this->sensors_) n += it.second.fresh;
    return n;
  }

  // Serializes all fresh readings and resets them, so each value is sent once.
  std::string take_json() {
    std::string out = "{\"readings\":[";
    bool first = true;
    for (auto &it : this->sensors_) {
      Reading &r = it.second;
      if (!r.fresh) continue;
      if (!first) out += ',';
      first = false;
      out += "{\"mac\":\"" + it.first + "\",\"type\":\"";
      out += r.type == SensorType::FLOWER_CARE ? "flower_care" : "hygrometer";
      out += '"';
      append_field_(out, "moisture", r.moisture, 0);
      append_field_(out, "temperature", r.temperature, 1);
      append_field_(out, "light", r.light, 0);
      append_field_(out, "conductivity", r.conductivity, 0);
      append_field_(out, "humidity", r.humidity, 1);
      append_field_(out, "battery", r.battery, 0);
      out += ",\"rssi\":" + std::to_string(r.rssi) + '}';
      const SensorType type = r.type;
      r = Reading{};
      r.type = type;
    }
    out += "]}";
    return out;
  }

 protected:
  void merge_(const uint8_t *mac, int rssi, SensorType type, const Reading &parsed) {
    const std::string key = format_mac(mac);
    auto it = this->sensors_.find(key);
    if (it == this->sensors_.end()) {
      if (this->sensors_.size() >= MAX_SENSORS) return;
      it = this->sensors_.emplace(key, Reading{}).first;
    }
    Reading &r = it->second;
    r.type = type;
    r.rssi = rssi;
    r.fresh = true;
    for (auto field : {&Reading::moisture, &Reading::temperature, &Reading::light, &Reading::conductivity,
                       &Reading::humidity, &Reading::battery}) {
      if (!std::isnan(parsed.*field)) r.*field = parsed.*field;
    }
  }

  static void append_field_(std::string &out, const char *name, float value, int decimals) {
    if (std::isnan(value)) return;
    char buf[48];
    snprintf(buf, sizeof(buf), ",\"%s\":%.*f", name, decimals, value);
    out += buf;
  }

  std::map<std::string, Reading> sensors_;
};

inline Store &store() {
  static Store instance;
  return instance;
}

}  // namespace plant_ble
