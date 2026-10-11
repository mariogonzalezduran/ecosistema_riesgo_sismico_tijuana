-- Esquema del tablero: estaciones, eventos, talleres y contadores de visitas.
-- Lectura pública; escritura solo desde el panel de Supabase o con la clave de servicio.

create table public.stations (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('suelo','estructura')),
  uso text,
  soil text check (soil in ('I','II','IIIa','IIIb')),
  status text not null check (status in ('operando','instalacion','planeada')),
  lat double precision,
  lon double precision,
  p10 double precision,      -- ruido ambiental P10 (dB)
  f0 double precision,       -- frecuencia fundamental del sitio (Hz)
  vs30 double precision,     -- m/s
  f0base double precision,   -- frecuencia base de la estructura (Hz)
  f0last double precision,   -- última frecuencia medida (Hz)
  ejemplo boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.events (
  id text primary key,
  name text not null,
  date date,
  mag double precision,
  pga jsonb not null default '{}'::jsonb,  -- {"id_estacion": PGA en g}
  rev jsonb not null default '{}'::jsonb,  -- {"id_estructura": true} revisadas
  ejemplo boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.talleres (
  id text primary key,
  fecha date not null,
  sede text not null,
  publico text not null check (publico in ('ninos','jovenes','lideres','proteccion_civil','general')),
  asistentes integer check (asistentes >= 0),
  tema text,
  ejemplo boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.visitas (
  componente text primary key check (componente in ('resumen','riesgo','suelo','estaciones','mapas','inspeccion','difusion')),
  total bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.stations enable row level security;
alter table public.events enable row level security;
alter table public.talleres enable row level security;
alter table public.visitas enable row level security;

create policy "lectura publica de estaciones" on public.stations for select to anon, authenticated using (true);
create policy "lectura publica de eventos" on public.events for select to anon, authenticated using (true);
create policy "lectura publica de talleres" on public.talleres for select to anon, authenticated using (true);
create policy "lectura publica de visitas" on public.visitas for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.stations, public.events, public.talleres, public.visitas to anon, authenticated;

insert into public.visitas (componente) values
  ('resumen'),('riesgo'),('suelo'),('estaciones'),('mapas'),('inspeccion'),('difusion');

-- Suma una visita a un componente y devuelve el total.
create or replace function public.registrar_visita(p_componente text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.visitas
     set total = total + 1, updated_at = now()
   where componente = p_componente
  returning total;
$$;

revoke all on function public.registrar_visita(text) from public;
grant execute on function public.registrar_visita(text) to anon, authenticated;
