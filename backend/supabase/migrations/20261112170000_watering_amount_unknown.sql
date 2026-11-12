-- A detected watering can be confirmed without knowing the amount ("Weiß nicht"): it then counts
-- as a watering (no more question, drying stretches split correctly) but not for ml learning.
alter table waterings alter column amount_ml drop not null;
