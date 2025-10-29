create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(768) not null,
  source text,
  section text,
  heading text,
  lang text default 'sv',
  created_at timestamptz default now()
);

create index if not exists docs_embedding_idx
  on public.docs using ivfflat (embedding vector_l2_ops)
  with (lists = 100);

alter table public.docs disable row level security;

create or replace function public.match_documents (
  query_embedding vector(768),
  match_count int default 6
) returns table (
  id uuid,
  content text,
  section text,
  heading text,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    d.id,
    d.content,
    d.section,
    d.heading,
    d.source,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.docs d
  order by d.embedding <-> query_embedding
  limit match_count;
end;
$$;