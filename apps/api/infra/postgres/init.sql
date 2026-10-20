-- Roda uma única vez, quando o volume do Postgres é criado (docker-entrypoint-initdb.d).
-- O banco de desenvolvimento `trampoja` vem de POSTGRES_DB no docker-compose.yml;
-- aqui criamos o banco dos testes de integração.
CREATE DATABASE trampoja_teste OWNER trampoja;
