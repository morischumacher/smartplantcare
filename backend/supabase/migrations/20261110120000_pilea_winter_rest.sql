-- Pilea peperomioides (Ufopflanze) rests in winter: cooler (12–15 °C) and drier than in summer.
update species
set winter_rest = true,
    winter_moisture_min = 8,
    care_notes = 'Hell, regelmäßig drehen, damit sie gerade wächst. Lieber etwas trockener; im Winter kühler (12–15 °C) und sparsamer gießen.'
where scientific_name = 'Pilea peperomioides';
