-- 015 — Curated knowledge base for grounded assistant answers.
--
-- Every chunk retains a path back to `source_url` or `source_note`. A chunk
-- with no traceable source is not admitted, because the assistant would then be
-- unable to cite it — and an uncited claim about a prerequisite is exactly the
-- failure mode this corpus exists to prevent.

create table public.knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text not null check (category in ('curriculum','policy','calendar','org','faq')),
  program_code text,
  source_url   text,
  source_note  text,
  content      text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (source_url is not null or source_note is not null)
);

create table public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  ordinal     smallint not null,
  content     text not null,
  embedding   extensions.vector(384),
  created_at  timestamptz not null default now()
);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks    enable row level security;

create policy kb_docs_read   on public.knowledge_documents for select using (is_active);
create policy kb_chunks_read on public.knowledge_chunks    for select using (true);

create index idx_kb_chunks_doc on public.knowledge_chunks (document_id, ordinal);


-- Retrieval runs under the caller's RLS. The similarity floor and the minimum
-- surviving-chunk count are enforced by the caller, not here: calling a model
-- with thin context is how hallucination happens (AI spec §5.3).
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(384),
  match_count int default 8,
  similarity_floor float default 0.35,
  program_filter text default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  source_title text,
  source_url text,
  similarity float
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    c.id,
    d.id,
    c.content,
    d.title,
    d.source_url,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where d.is_active
    and c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= similarity_floor
  order by
    -- A chunk from the student's own program wins ties.
    (program_filter is not null and d.program_code = program_filter) desc,
    c.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

select public.attach_updated_at('public.knowledge_documents');
