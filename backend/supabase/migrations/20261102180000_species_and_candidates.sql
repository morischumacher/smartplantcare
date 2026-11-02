-- Plant species database (care profiles with example image) and plants detected on room photos.
--
-- species: curated base list below (source 'curated'); unknown species get a profile written by
-- Claude on demand (source 'ai'). Values use the Flower Care scales: moisture %, light in lux at the
-- sensor, conductivity in µS/cm. Fertilize only in the growing season (March–September).
-- Example images come from Wikimedia Commons with author and licence stored for attribution.

create table species (
  id                    uuid primary key default gen_random_uuid(),
  scientific_name       text not null unique,
  common_name_de        text not null,
  aliases               text[] not null default '{}',   -- other names, used for matching
  moisture_min          numeric(4,1) not null,
  moisture_max          numeric(4,1) not null,
  light_min_lux         integer,
  light_max_lux         integer,
  temp_min_c            numeric(4,1),
  temp_max_c            numeric(4,1),
  humidity_min          numeric(4,1),
  humidity_max          numeric(4,1),
  conductivity_min      integer,
  conductivity_max      integer,
  winter_rest           boolean not null default false,
  winter_moisture_min   numeric(4,1),                    -- lower watering threshold during winter rest
  fertilize_every_days  integer check (fertilize_every_days > 0),
  soil_type             text not null default 'universal'
                        check (soil_type in ('universal', 'cactus', 'orchid', 'herb', 'peat_free', 'other')),
  toxic_to_pets         boolean,
  care_notes            text,
  image_url             text,
  image_author          text,
  image_license         text,
  image_source_url      text,
  image_checked_at      timestamptz,                     -- set once a Wikimedia lookup ran (even without result)
  source                text not null default 'curated' check (source in ('curated', 'ai', 'manual')),
  created_at            timestamptz not null default now(),
  check (moisture_min < moisture_max)
);

alter table plants add column species_id uuid references species (id) on delete set null;
create index on plants (species_id);

-- Room scan from an iPhone LiDAR app (floor plan as PDF or image), used by plan-room for exact geometry.
alter table rooms add column scan_path text;

-- Plants Claude spotted on room photos that are not set up yet; the user confirms, corrects or dismisses them.
create table plant_candidates (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references rooms (id) on delete cascade,
  photo_path      text,                -- room photo the plant is best visible on
  box             jsonb,               -- {x, y, w, h} as fractions (0–1) of that photo
  description     text,                -- what Claude saw, e.g. "große Pflanze links vom Fenster"
  species_guess   text,                -- scientific name as guessed
  species_id      uuid references species (id) on delete set null,
  confidence      text not null check (confidence in ('high', 'medium', 'low')),
  map_x           numeric(6,2),
  map_y           numeric(6,2),
  closeup_path    text,                -- close-up photo taken to identify it
  status          text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  plant_id        uuid references plants (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on plant_candidates (room_id, status);

alter table species enable row level security;
alter table plant_candidates enable row level security;
create policy "authenticated full access" on species for all to authenticated using (true) with check (true);
create policy "authenticated full access" on plant_candidates for all to authenticated using (true) with check (true);
grant all on species, plant_candidates to authenticated, service_role;

insert into species (scientific_name, common_name_de, aliases, moisture_min, moisture_max, light_min_lux, light_max_lux,
  temp_min_c, temp_max_c, humidity_min, humidity_max, conductivity_min, conductivity_max, winter_rest, winter_moisture_min,
  fertilize_every_days, soil_type, toxic_to_pets, care_notes) values
  ('Monstera deliciosa', 'Fensterblatt', array['Monstera','Swiss Cheese Plant']::text[], 15, 50, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Hell ohne pralle Mittagssonne. Erst gießen, wenn die oberen Zentimeter trocken sind; Luftwurzeln nicht abschneiden.'),
  ('Monstera adansonii', 'Monstera adansonii', array['Affenmaske','Monkey Mask']::text[], 15, 50, 800, 15000, 16, 30, 50, 70, 350, 2000, false, null, 14, 'universal', true, 'Mag etwas mehr Luftfeuchte als die große Monstera; gleichmäßig leicht feucht halten.'),
  ('Epipremnum aureum', 'Efeutute', array['Pothos','Golden Pothos']::text[], 15, 45, 300, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Sehr robust, verträgt auch wenig Licht. Hängende Triebe zeigen Wassermangel früh an.'),
  ('Philodendron hederaceum', 'Kletterphilodendron', array['Philodendron scandens','Herzblatt-Philodendron']::text[], 15, 45, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Anspruchslos; bei zu wenig Licht werden die Blätter klein.'),
  ('Thaumatophyllum bipinnatifidum', 'Baumfreund', array['Philodendron bipinnatifidum','Philodendron selloum']::text[], 15, 50, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Braucht viel Platz und hellen Standort.'),
  ('Scindapsus pictus', 'Silberne Efeutute', array['Satin Pothos']::text[], 12, 40, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Etwas trockener halten als die Efeutute; rollt die Blätter ein, wenn sie Wasser braucht.'),
  ('Ficus lyrata', 'Geigenfeige', array['Fiddle Leaf Fig']::text[], 15, 50, 2000, 25000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Sehr hell, möglichst nicht umstellen – reagiert mit Blattfall. Zugluft vermeiden.'),
  ('Ficus elastica', 'Gummibaum', array['Rubber Plant']::text[], 12, 45, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Robust; Blätter ab und zu abwischen. Mäßig gießen.'),
  ('Ficus benjamina', 'Birkenfeige', array['Benjamini']::text[], 15, 50, 1500, 20000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Hell, gleichmäßige Temperatur; wirft bei Standortwechsel Blätter ab.'),
  ('Dracaena trifasciata', 'Bogenhanf', array['Sansevieria trifasciata','Schwiegermutterzunge','Snake Plant']::text[], 7, 30, 300, 20000, 15, 30, 30, 60, 200, 1500, true, 5, 30, 'universal', true, 'Sehr sparsam gießen, im Winter fast gar nicht. Staunässe ist das größte Risiko.'),
  ('Zamioculcas zamiifolia', 'Glücksfeder', array['ZZ-Pflanze','Zamie']::text[], 10, 35, 300, 20000, 15, 30, 30, 60, 200, 1500, true, 7, 30, 'universal', true, 'Speichert Wasser in den Knollen; lieber zu trocken als zu nass.'),
  ('Spathiphyllum wallisii', 'Einblatt', array['Friedenslilie','Peace Lily']::text[], 25, 55, 500, 10000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', true, 'Lässt bei Trockenheit deutlich die Blätter hängen und erholt sich nach dem Gießen schnell.'),
  ('Chlorophytum comosum', 'Grünlilie', array['Spider Plant']::text[], 15, 45, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', false, 'Sehr anspruchslos, bildet Ableger. Braune Spitzen deuten auf trockene Luft oder kalkiges Wasser.'),
  ('Goeppertia orbifolia', 'Korbmarante orbifolia', array['Calathea orbifolia']::text[], 25, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Braucht hohe Luftfeuchte und kalkarmes Wasser; rollt bei Trockenheit die Blätter ein.'),
  ('Goeppertia insignis', 'Korbmarante lancifolia', array['Calathea lancifolia','Klapperschlangenpflanze']::text[], 25, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Gleichmäßig feucht, nie austrocknen lassen; keine direkte Sonne.'),
  ('Maranta leuconeura', 'Pfeilwurz', array['Gebetspflanze','Prayer Plant']::text[], 25, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Faltet nachts die Blätter zusammen. Gleichmäßig feucht und warm halten.'),
  ('Stromanthe sanguinea', 'Stromanthe', array['Stromanthe Triostar']::text[], 25, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Wie Calathea: hohe Luftfeuchte, kalkarmes Wasser.'),
  ('Alocasia × amazonica', 'Pfeilblatt', array['Alocasia Polly','Elefantenohr']::text[], 25, 60, 500, 8000, 18, 30, 60, 80, 300, 1500, true, 20, 21, 'universal', true, 'Warm und hell; kann im Winter einziehen. Spinnmilben bei trockener Luft.'),
  ('Alocasia macrorrhizos', 'Riesen-Alokasie', array['Elefantenohr']::text[], 25, 60, 1000, 15000, 18, 28, 60, 80, 300, 1500, true, 20, 21, 'universal', true, 'Braucht viel Wasser im Sommer, im Winter deutlich weniger.'),
  ('Anthurium andraeanum', 'Flamingoblume', array['Anthurie']::text[], 20, 50, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', true, 'Hell ohne Sonne, hohe Luftfeuchte; luftiges Substrat.'),
  ('Aglaonema commutatum', 'Kolbenfaden', array['Aglaonema','Chinese Evergreen']::text[], 15, 50, 300, 10000, 18, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Verträgt wenig Licht; mag es warm, nicht unter 16 °C.'),
  ('Dieffenbachia seguine', 'Dieffenbachie', array['Dieffenbachia']::text[], 15, 50, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Pflanzensaft giftig. Hell, warm, gleichmäßig leicht feucht.'),
  ('Dracaena fragrans', 'Duftender Drachenbaum', array['Dracaena Massangeana','Glücksbambus-Verwandte']::text[], 12, 40, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Mäßig gießen; braune Spitzen bei kalkhaltigem Wasser.'),
  ('Dracaena marginata', 'Gerandeter Drachenbaum', array['Dracaena reflexa var. angustifolia']::text[], 12, 40, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Robust; lieber etwas trockener halten.'),
  ('Yucca gigantea', 'Riesen-Palmlilie', array['Yucca elephantipes','Yucca-Palme']::text[], 10, 35, 3000, 50000, 15, 30, 30, 60, 200, 1500, true, 7, 30, 'universal', true, 'Sehr hell bis sonnig; im Winter kühler und trocken.'),
  ('Beaucarnea recurvata', 'Elefantenfuß', array['Flaschenbaum','Ponytail Palm']::text[], 7, 25, 3000, 60000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', false, 'Speichert Wasser im Stamm; sehr sparsam gießen.'),
  ('Chamaedorea elegans', 'Bergpalme', array['Zimmerpalme','Parlour Palm']::text[], 20, 50, 500, 10000, 16, 28, 40, 70, 350, 2000, false, null, 21, 'universal', false, 'Verträgt Halbschatten; gleichmäßig leicht feucht.'),
  ('Dypsis lutescens', 'Goldfruchtpalme', array['Areca-Palme']::text[], 20, 50, 1000, 20000, 16, 28, 50, 70, 350, 2000, false, null, 21, 'universal', false, 'Hell, hohe Luftfeuchte; braune Spitzen bei trockener Heizungsluft.'),
  ('Howea forsteriana', 'Kentiapalme', array['Kentia']::text[], 20, 50, 500, 15000, 16, 28, 40, 70, 350, 2000, false, null, 21, 'universal', false, 'Langsamwüchsig und robust; verträgt auch weniger Licht.'),
  ('Strelitzia reginae', 'Paradiesvogelblume', array['Strelitzie']::text[], 15, 50, 5000, 50000, 12, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Sehr hell bis sonnig; im Winter kühler (12–15 °C) für die Blüte.'),
  ('Strelitzia nicolai', 'Baum-Strelitzie', array['Weiße Strelitzie']::text[], 15, 50, 3000, 40000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Groß und lichthungrig; im Sommer reichlich gießen.'),
  ('Pilea peperomioides', 'Ufopflanze', array['Glückstaler','Chinese Money Plant']::text[], 12, 40, 1500, 20000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', false, 'Hell, regelmäßig drehen, damit sie gerade wächst. Lieber etwas trockener.'),
  ('Peperomia obtusifolia', 'Fleischiger Zwergpfeffer', array['Peperomie','Baby Rubber Plant']::text[], 10, 35, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', false, 'Speichert Wasser in den Blättern; sparsam gießen.'),
  ('Peperomia argyreia', 'Wassermelonen-Peperomie', array['Watermelon Peperomia']::text[], 12, 40, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', false, 'Hell ohne Sonne; zwischen dem Gießen antrocknen lassen.'),
  ('Hoya carnosa', 'Wachsblume', array['Porzellanblume','Hoya']::text[], 10, 35, 1500, 25000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', false, 'Fleischige Blätter, lieber trocken; Blütenstiele nicht abschneiden.'),
  ('Ceropegia woodii', 'Leuchterblume', array['Herzchenkette','String of Hearts']::text[], 7, 25, 2000, 30000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', false, 'Hängepflanze mit Speicherknollen; sehr sparsam gießen.'),
  ('Tradescantia zebrina', 'Zebra-Ampelkraut', array['Tradeskantie','Dreimasterblume']::text[], 15, 45, 1500, 20000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Wächst schnell; braucht Licht für die Färbung.'),
  ('Syngonium podophyllum', 'Purpurtute', array['Syngonium','Arrowhead Plant']::text[], 18, 50, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Gleichmäßig leicht feucht, hell ohne Sonne.'),
  ('Nephrolepis exaltata', 'Schwertfarn', array['Boston-Farn']::text[], 30, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Nie austrocknen lassen; liebt Luftfeuchte und Bad oder Küche.'),
  ('Asplenium nidus', 'Nestfarn', array['Vogelnestfarn']::text[], 25, 60, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Nicht in die Blattrosette gießen; gleichmäßig feucht.'),
  ('Adiantum raddianum', 'Frauenhaarfarn', array['Venushaarfarn']::text[], 30, 65, 500, 8000, 18, 28, 60, 85, 300, 1500, false, null, 21, 'universal', false, 'Sehr empfindlich gegen Trockenheit; nie austrocknen lassen.'),
  ('Platycerium bifurcatum', 'Geweihfarn', array['Hirschgeweihfarn']::text[], 15, 45, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Eher tauchen als gießen; Schildblätter nicht entfernen.'),
  ('Phalaenopsis', 'Schmetterlingsorchidee', array['Phalaenopsis-Orchidee','Orchidee']::text[], 15, 40, 1500, 15000, 18, 28, 50, 70, 100, 600, false, null, 21, 'orchid', false, 'Einmal pro Woche tauchen und gut abtropfen lassen; Luftwurzeln brauchen Licht.'),
  ('Aloe vera', 'Echte Aloe', array['Aloe barbadensis']::text[], 7, 25, 3000, 60000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', true, 'Sonnig, sehr sparsam gießen, im Winter fast trocken.'),
  ('Crassula ovata', 'Geldbaum', array['Pfennigbaum','Jadebaum']::text[], 7, 25, 3000, 60000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', true, 'Hell bis sonnig; im Winter kühl und trocken für die Blüte.'),
  ('Echeveria elegans', 'Echeverie', array['Mexikanischer Schneeball']::text[], 7, 25, 5000, 70000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', false, 'Volle Sonne, nur gießen wenn ganz trocken; Wasser nicht in die Rosette.'),
  ('Haworthiopsis attenuata', 'Haworthie', array['Haworthia','Zebra-Haworthie']::text[], 7, 25, 1500, 30000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', false, 'Verträgt mehr Schatten als andere Sukkulenten.'),
  ('Curio rowleyanus', 'Erbsenpflanze', array['Senecio rowleyanus','Perlenkette','String of Pearls']::text[], 7, 25, 3000, 60000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', true, 'Flacher Topf, hell; die Perlen schrumpeln bei Wassermangel.'),
  ('Opuntia microdasys', 'Hasenohr-Kaktus', array['Opuntie']::text[], 7, 20, 5000, 80000, 5, 35, 25, 50, 150, 1000, true, 3, 30, 'cactus', false, 'Glochiden haften an der Haut – nur mit Handschuhen anfassen.'),
  ('Mammillaria elongata', 'Warzenkaktus', array['Mammillaria']::text[], 7, 20, 5000, 80000, 5, 35, 25, 50, 150, 1000, true, 3, 30, 'cactus', false, 'Kühle, trockene Winterruhe fördert die Blüte.'),
  ('Schlumbergera truncata', 'Weihnachtskaktus', array['Gliederkaktus']::text[], 15, 40, 1000, 15000, 18, 28, 50, 70, 100, 600, true, 10, 21, 'cactus', false, 'Kein Wüstenkaktus: gleichmäßig leicht feucht, nach der Blüte Ruhezeit.'),
  ('Euphorbia trigona', 'Afrikanischer Milchbaum', array['Kaktus-Wolfsmilch']::text[], 7, 25, 3000, 60000, 10, 32, 30, 50, 150, 1000, true, 5, 30, 'cactus', true, 'Milchsaft reizt Haut und Augen. Sonnig, sparsam gießen.'),
  ('Begonia maculata', 'Forellenbegonie', array['Polka-Dot-Begonie']::text[], 20, 50, 500, 8000, 18, 28, 50, 70, 300, 1500, false, null, 21, 'universal', true, 'Nicht auf die Blätter sprühen (Mehltau); gleichmäßig leicht feucht.'),
  ('Fittonia albivenis', 'Mosaikpflanze', array['Fittonie','Nerve Plant']::text[], 30, 65, 500, 8000, 18, 28, 60, 80, 300, 1500, false, null, 21, 'universal', false, 'Kollabiert bei Trockenheit, erholt sich nach dem Gießen.'),
  ('Fatsia japonica', 'Zimmeraralie', array['Japanische Aralie']::text[], 15, 50, 800, 15000, 8, 25, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Mag es kühl (auch 10 °C im Winter) und hell.'),
  ('Hedera helix', 'Efeu', array['Gemeiner Efeu']::text[], 15, 45, 800, 15000, 8, 24, 40, 65, 300, 1500, false, null, 21, 'universal', true, 'Kühl und hell; in warmer Heizungsluft anfällig für Spinnmilben.'),
  ('Schefflera arboricola', 'Strahlenaralie', array['Schefflera','Zwerg-Schefflera']::text[], 15, 50, 800, 15000, 16, 30, 40, 70, 350, 2000, false, null, 14, 'universal', true, 'Robust, verträgt Rückschnitt.'),
  ('Codiaeum variegatum', 'Wunderstrauch', array['Kroton','Croton']::text[], 15, 50, 3000, 30000, 16, 30, 50, 70, 350, 2000, false, null, 14, 'universal', true, 'Braucht viel Licht für die bunte Färbung; empfindlich gegen Zugluft.'),
  ('Rhipsalis baccifera', 'Rutenkaktus', array['Rhipsalis']::text[], 15, 45, 800, 15000, 15, 30, 40, 65, 300, 1500, false, null, 21, 'cactus', false, 'Epiphytischer Kaktus: hell ohne Sonne, leicht feucht.'),
  ('Ocimum basilicum', 'Basilikum', array['Basil']::text[], 20, 55, 5000, 50000, 15, 28, 40, 60, 400, 2000, false, null, 14, 'herb', false, 'Sonnig, morgens gießen und Staunässe meiden; Triebspitzen ernten.'),
  ('Mentha spicata', 'Grüne Minze', array['Minze','Spearmint']::text[], 30, 60, 3000, 40000, 15, 28, 40, 60, 400, 2000, false, null, 14, 'herb', false, 'Gleichmäßig feucht, verträgt Halbschatten.');
