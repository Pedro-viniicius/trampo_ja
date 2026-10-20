# MVP do Trampo Já: conectar freelancers e empregadores

- Status: aprovado (pedido direto do dono em 2026-10-20)
- Prioridade: alta
- Data: 2026-10-20

## Problema

Ver `docs/produto/visao.md`. Freelancers e empregadores não têm um lugar simples, no celular, para publicar, encontrar e combinar trabalhos avulsos.

## Para quem

Freelancers e empregadores (pessoa física ou pequeno negócio). A mesma conta pode exercer os dois papéis.

## Por que agora

O protótipo visual já existe no Figma e o dono quer o app construído a partir dele.

## Proposta

Aplicativo mobile com cinco capacidades: conta e perfil; publicação de trampos (pelo empregador); oferta de serviços (pelo freelancer); busca e candidatura/contratação; conversa entre as partes. Backend como monólito modular com arquitetura hexagonal e núcleo DDD.

## Histórias de usuário

- Como visitante, quero criar uma conta com e-mail e senha, para publicar e me candidatar.
- Como usuário, quero montar meu perfil (nome, cidade, foto, descrição, habilidades), para que os outros saibam quem eu sou.
- Como empregador, quero publicar um trampo (título, descrição, categoria, cidade, valor ou faixa, prazo), para receber candidaturas.
- Como freelancer, quero ofertar um serviço (título, descrição, categoria, preço base), para ser encontrado.
- Como usuário, quero buscar trampos e serviços por texto, categoria e cidade, para achar o que me interessa.
- Como freelancer, quero me candidatar a um trampo com uma mensagem e um valor proposto, para disputar a vaga.
- Como empregador, quero ver as candidaturas de um trampo e aceitar uma delas, para fechar o trabalho.
- Como usuário, quero conversar com a outra parte dentro do app, para combinar detalhes.

## Critérios de aceite

- CA1 — Dado um visitante, quando ele informa e-mail válido e senha com ao menos 8 caracteres, então a conta é criada, a senha é guardada só como hash e ele entra autenticado.
- CA2 — Dado um e-mail já cadastrado, quando alguém tenta criar conta com ele, então o cadastro é recusado com mensagem clara e sem revelar dados da conta existente.
- CA3 — Dado um usuário autenticado, quando ele preenche o perfil com nome, cidade e ao menos uma habilidade, então o perfil fica completo e visível para outros usuários.
- CA4 — Dado um usuário autenticado, quando ele publica um trampo com título (5 a 80 caracteres), descrição, categoria, cidade e valor maior que zero, então o trampo fica aberto e aparece na busca.
- CA5 — Dado um trampo, quando faltar título, categoria ou cidade, ou o valor for zero ou negativo, então a publicação é recusada apontando o campo.
- CA6 — Dado um usuário autenticado, quando ele oferta um serviço com título, descrição, categoria e preço base maior que zero, então o serviço fica ativo e aparece na busca.
- CA7 — Dado trampos e serviços cadastrados, quando o usuário busca por texto, categoria ou cidade, então só os itens que atendem a todos os filtros informados aparecem, com os mais recentes primeiro.
- CA8 — Dado um trampo aberto, quando um freelancer envia candidatura com mensagem e valor proposto maior que zero, então a candidatura fica pendente e o empregador a vê na lista do trampo.
- CA9 — Dado um trampo, quando o próprio autor tenta se candidatar, ou o mesmo freelancer tenta se candidatar duas vezes, então a candidatura é recusada.
- CA10 — Dado um trampo com candidaturas pendentes, quando o empregador aceita uma, então o trampo passa a "em andamento", a candidatura aceita fica "aceita" e as demais ficam "recusadas".
- CA11 — Dado um trampo que não está aberto, quando alguém tenta se candidatar, então a candidatura é recusada.
- CA12 — Dado dois usuários com uma candidatura ou contratação entre eles, quando um envia mensagem de texto não vazia, então ela aparece na conversa dos dois em ordem cronológica.
- CA13 — Dado um usuário sem relação (candidatura ou contratação) com outro, quando tenta abrir conversa com ele, então é recusado.
- CA14 — Dado qualquer requisição que exige autenticação, quando o token está ausente ou inválido, então a resposta é 401 e nenhum dado é retornado.
- CA15 — Dado qualquer log ou mensagem de erro do sistema, então nunca contém e-mail, senha, telefone ou nome de usuário.
- CA16 — Dado o app mobile, quando aberto, então usa a logo e as cores do protótipo do Figma, com telas de entrada, cadastro, início, busca, detalhe de trampo, detalhe de serviço, publicação, candidaturas, conversas e perfil.

## Fora do escopo

- Pagamento dentro do app.
- Avaliações e reputação.
- Notificações push.
- Login social (Google, Apple).
- Upload de foto de perfil (no MVP, avatar por inicial do nome).
- Geolocalização por GPS (cidade é texto escolhido pelo usuário).

## Como vamos medir o sucesso

Métricas da visão: trampos e serviços publicados, candidaturas em 48 h e conversas iniciadas.

## Riscos e premissas

- Premissa: um único backend (monólito modular) atende o app; não há microsserviços.
- Premissa: cidade como texto livre normalizado (sem base oficial de municípios) no MVP.
- Risco: fidelidade ao protótipo depende do acesso ao Figma; o designer especifica a partir dele.

## Pendências para entrar no ar (não bloqueiam o desenvolvimento)

- Política de privacidade e termos de uso (LGPD): confirmar com profissional.
- Publicação nas lojas (contas Apple e Google).

## Perguntas em aberto

- Modelo de monetização.
- Lista fechada de categorias ou texto livre.

## Interface

Tem telas (todas listadas no CA16). Precisa de spec do designer a partir do Figma.
