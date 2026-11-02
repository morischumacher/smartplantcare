-- Removes everything demo.sql created (readings, links, pots and waterings cascade).
delete from plants where name = 'Demo-Monstera';
delete from sensors where mac in ('DE:AD:BE:EF:00:01', 'DE:AD:BE:EF:00:02');
delete from rooms where name = 'Demo-Raum';
