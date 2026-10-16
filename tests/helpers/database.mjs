import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export const alice="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",bob="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export async function applicationDatabase() {
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);insert into auth.users(id) values('${alice}'),('${bob}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
 grant usage on schema auth,storage,public to authenticated,anon;
 alter default privileges in schema public grant all on tables to authenticated,anon;`);
 const directory=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,directory),'utf8'));
 return db;
}
export async function asUser(db,owner) { await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); }
