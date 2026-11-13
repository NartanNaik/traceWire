-- Tracewire migration 003: notes on pages and wires. Run once, after 002.
alter table public.screens add column note text not null default ''
  check (char_length(note) <= 2000);
alter table public.links add column note text not null default ''
  check (char_length(note) <= 2000);