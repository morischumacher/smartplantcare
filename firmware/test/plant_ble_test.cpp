// Unit tests for plant_ble.h. Run: firmware/test/run.sh

#include "../plant_ble.h"

#include <cassert>
#include <cstdio>
#include <vector>

using namespace plant_ble;

// Minimal stand-ins for esp32_ble_tracker::ESPBTDevice / ServiceData / ESPBTUUID.
struct FakeUUID {
  uint16_t value;
  bool contains(uint8_t a, uint8_t b) const { return (value & 0xFF) == a && (value >> 8) == b; }
};
struct FakeServiceData {
  FakeUUID uuid;
  std::vector<uint8_t> data;
};
struct FakeDevice {
  uint8_t mac[6];
  int rssi;
  std::vector<FakeServiceData> service_datas;
  std::vector<FakeServiceData> manufacturer_datas;
  const uint8_t *address() const { return mac; }
  int get_rssi() const { return rssi; }
  const std::vector<FakeServiceData> &get_service_datas() const { return service_datas; }
  const std::vector<FakeServiceData> &get_manufacturer_datas() const { return manufacturer_datas; }
};

// MiBeacon header of a Flower Care (frame control 0x2071 = object + capability, product 0x0098,
// counter, reversed MAC, capability byte) followed by one object.
static std::vector<uint8_t> mibeacon(std::vector<uint8_t> object) {
  std::vector<uint8_t> d = {0x71, 0x20, 0x98, 0x00, 0x12, 0x34, 0x12, 0x6A, 0x8D, 0x7C, 0xC4, 0x0D};
  d.insert(d.end(), object.begin(), object.end());
  return d;
}

static bool near(float a, float b) { return std::fabs(a - b) < 0.01f; }

static void test_mibeacon_values() {
  Reading r;
  auto d = mibeacon({0x08, 0x10, 0x01, 0x17});
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.moisture, 23));
  d = mibeacon({0x04, 0x10, 0x02, 0xD6, 0x00});
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.temperature, 21.4f));
  d = mibeacon({0x04, 0x10, 0x02, 0xE7, 0xFF});  // -2.5 °C
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.temperature, -2.5f));
  d = mibeacon({0x07, 0x10, 0x03, 0x52, 0x03, 0x00});
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.light, 850));
  d = mibeacon({0x07, 0x10, 0x03, 0xA0, 0x86, 0x01});  // 100000 lux, uses the third byte
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.light, 100000));
  d = mibeacon({0x09, 0x10, 0x02, 0x54, 0x01});
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.conductivity, 340));
  d = mibeacon({0x0A, 0x10, 0x01, 0x5F});
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.battery, 95));
}

static void test_mibeacon_without_capability() {
  std::vector<uint8_t> d = {0x51, 0x20, 0x98, 0x00, 0x01, 0x34, 0x12, 0x6A, 0x8D, 0x7C, 0xC4, 0x08, 0x10, 0x01, 0x2A};
  Reading r;
  assert(parse_mibeacon(d.data(), d.size(), r) && near(r.moisture, 42));
}

static void test_mibeacon_rejects() {
  Reading r;
  auto other_product = mibeacon({0x08, 0x10, 0x01, 0x17});
  other_product[2] = 0x5B;  // LYWSD03MMC
  assert(!parse_mibeacon(other_product.data(), other_product.size(), r));
  auto encrypted = mibeacon({0x08, 0x10, 0x01, 0x17});
  encrypted[0] |= 0x08;
  assert(!parse_mibeacon(encrypted.data(), encrypted.size(), r));
  auto truncated = mibeacon({0x07, 0x10, 0x03, 0x52});
  assert(!parse_mibeacon(truncated.data(), truncated.size(), r));
  auto no_object = mibeacon({});
  assert(!parse_mibeacon(no_object.data(), no_object.size(), r));
  assert(std::isnan(r.moisture));
}

static void test_govee() {
  Reading r;
  std::vector<uint8_t> d = {0x00, 0x03, 0xF2, 0xB9, 0x64, 0x00};  // 258745 → 25.8 °C, 74.5 %, 100 %
  assert(parse_govee_h5075(d.data(), d.size(), r));
  assert(near(r.temperature, 25.8f) && near(r.humidity, 74.5f) && near(r.battery, 100));

  std::vector<uint8_t> neg = {0x00, 0x80, 0xCC, 0x51, 0x37, 0x00};  // negative flag + 52305 → -5.2 °C, 30.5 %
  assert(parse_govee_h5075(neg.data(), neg.size(), r));
  assert(near(r.temperature, -5.2f) && near(r.humidity, 30.5f) && near(r.battery, 55));

  std::vector<uint8_t> wrong_len = {0x00, 0x03, 0xF2, 0xB9, 0x64};
  assert(!parse_govee_h5075(wrong_len.data(), wrong_len.size(), r));
}

static void test_store_merges_and_serializes() {
  Store s;
  FakeDevice flora{{0xC4, 0x7C, 0x8D, 0x6A, 0x12, 0x34}, -71, {}, {}};
  for (auto obj : std::vector<std::vector<uint8_t>>{{0x08, 0x10, 0x01, 0x17},
                                                    {0x04, 0x10, 0x02, 0xD6, 0x00},
                                                    {0x07, 0x10, 0x03, 0x52, 0x03, 0x00},
                                                    {0x09, 0x10, 0x02, 0x54, 0x01}}) {
    flora.service_datas = {{{0xFE95}, mibeacon(obj)}};
    s.on_advertise(flora);
  }
  FakeDevice govee{{0xA4, 0xC1, 0x38, 0x11, 0x22, 0x33}, -65, {}, {}};
  govee.manufacturer_datas = {{{0x004C}, {0x02, 0x15}},  // iBeacon frame the H5075 also sends: ignored
                              {{0xEC88}, {0x00, 0x03, 0xF2, 0xB9, 0x64, 0x00}}};
  s.on_advertise(govee);
  FakeDevice stranger{{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}, -80, {{{0x180F}, {0x50}}}, {}};
  s.on_advertise(stranger);

  assert(s.fresh_count() == 2);
  const std::string json = s.take_json();
  const std::string expected =
      "{\"readings\":["
      "{\"mac\":\"A4:C1:38:11:22:33\",\"type\":\"hygrometer\",\"temperature\":25.8,\"humidity\":74.5,"
      "\"battery\":100,\"rssi\":-65},"
      "{\"mac\":\"C4:7C:8D:6A:12:34\",\"type\":\"flower_care\",\"moisture\":23,\"temperature\":21.4,"
      "\"light\":850,\"conductivity\":340,\"rssi\":-71}"
      "]}";
  if (json != expected) {
    printf("got:      %s\nexpected: %s\n", json.c_str(), expected.c_str());
    assert(false);
  }

  // Values are sent once; afterwards only newly received ones show up.
  assert(s.fresh_count() == 0);
  assert(s.take_json() == "{\"readings\":[]}");
  flora.service_datas = {{{0xFE95}, mibeacon({0x08, 0x10, 0x01, 0x16})}};
  s.on_advertise(flora);
  assert(s.take_json() == "{\"readings\":[{\"mac\":\"C4:7C:8D:6A:12:34\",\"type\":\"flower_care\",\"moisture\":22,\"rssi\":-71}]}");
}

static void test_store_caps_sensor_count() {
  Store s;
  for (int i = 0; i < 40; i++) {
    FakeDevice d{{0xA4, 0xC1, 0x38, 0x00, 0x00, static_cast<uint8_t>(i)}, -60, {}, {}};
    d.manufacturer_datas = {{{0xEC88}, {0x00, 0x03, 0xF2, 0xB9, 0x64, 0x00}}};
    s.on_advertise(d);
  }
  assert(s.fresh_count() == MAX_SENSORS);
}

int main() {
  test_mibeacon_values();
  test_mibeacon_without_capability();
  test_mibeacon_rejects();
  test_govee();
  test_store_merges_and_serializes();
  test_store_caps_sensor_count();
  printf("all plant_ble tests passed\n");
  return 0;
}
