-- Datos de ejemplo (ficticios, marcados con ejemplo = true).
-- Para borrarlos:  delete from public.stations where ejemplo; delete from public.events where ejemplo; delete from public.talleres where ejemplo;

insert into public.stations (id,name,kind,uso,soil,status,lat,lon,p10,f0,vs30,f0base,f0last,ejemplo) values
('ej01','Ejemplo 01 · suelo tipo I','suelo','otro','I','operando',32.530,-117.085,-108,6.2,760,null,null,true),
('ej02','Ejemplo 02 · suelo tipo II','suelo','otro','II','operando',32.515,-117.020,-104,3.4,480,null,null,true),
('ej03','Ejemplo 03 · suelo tipo IIIa','suelo','otro','IIIa','operando',32.525,-116.960,-101,1.8,290,null,null,true),
('ej04','Ejemplo 04 · suelo tipo IIIb','suelo','otro','IIIb','operando',32.495,-116.930,-102,2.2,340,null,null,true),
('ej05','Ejemplo 05 · escuela','estructura','escuela','II','operando',32.480,-117.040,-103,3.1,450,4.2,4.1,true),
('ej06','Ejemplo 06 · escuela','estructura','escuela','IIIa','operando',32.505,-116.985,-101,1.9,300,3.6,3.1,true),
('ej07','Ejemplo 07 · hospital','estructura','hospital','II','operando',32.528,-117.010,-105,3.6,500,2.4,2.4,true),
('ej08','Ejemplo 08 · albergue','estructura','albergue','IIIb','instalacion',32.470,-116.900,null,null,null,5.0,null,true),
('ej09','Ejemplo 09 · suelo tipo I','suelo','otro','I','instalacion',32.445,-116.975,-97,null,null,null,null,true),
('ej10','Ejemplo 10 · edificio universitario','estructura','uabc','I','planeada',32.455,-117.050,null,null,null,null,null,true);

insert into public.events (id,name,date,mag,pga,rev,ejemplo) values
('ej-evento','Simulacro de ejemplo','2026-10-06',5.0,
 '{"ej01":0.021,"ej02":0.048,"ej03":0.112,"ej04":0.086,"ej05":0.039,"ej06":0.134,"ej07":0.057}'::jsonb,'{}'::jsonb,true);

insert into public.talleres (id,fecha,sede,publico,asistentes,tema,ejemplo) values
('ej-t1','2026-03-13','Unidad académica de ejemplo','jovenes',38,'Cómo funciona la red acelerométrica',true),
('ej-t2','2026-08-28','Escuela primaria de ejemplo','ninos',45,'Mitos y realidades de los sismos',true),
('ej-t3','2026-09-18','Escuela secundaria de ejemplo','jovenes',60,'Mesa vibradora y maquetas de edificios',true),
('ej-t4','2026-10-02','Comité vecinal de ejemplo','lideres',22,'Protocolos de evacuación y lugares seguros',true);
