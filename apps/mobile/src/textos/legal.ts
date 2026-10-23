/**
 * Espelho empacotado dos textos legais de `docs/produto/legal/*.md`, para as
 * telas exibirem sem rede. Mudou o `.md`, mude aqui: `legal.test.ts` compara
 * versão, títulos de seção e parágrafos. RASCUNHO até a revisão jurídica.
 */

export type SecaoLegal = {
  readonly titulo: string;
  readonly paragrafos: readonly string[];
};

export type DocumentoLegal = {
  readonly titulo: string;
  /** Data da versão (AAAA-MM-DD), a mesma do `.md`. */
  readonly versao: string;
  /** `true` enquanto o texto não passou pela revisão jurídica. */
  readonly rascunho: boolean;
  readonly secoes: readonly SecaoLegal[];
};

export const politicaDePrivacidade: DocumentoLegal = {
  titulo: 'Política de Privacidade',
  versao: '2026-10-22',
  rascunho: true,
  secoes: [
    {
      titulo: 'Quem somos e a quem este texto se aplica',
      paragrafos: [
        'O Trampo Já é um aplicativo que conecta freelancers e empregadores: quem precisa de um trabalho feito publica um trampo, e quem quer trabalhar oferece um serviço ou se candidata a um trampo. Esta política explica quais dados pessoais o aplicativo trata, para quê, com quem eles ficam visíveis, por quanto tempo são guardados e como você exerce os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
        'O controlador dos dados, isto é, quem decide como eles são tratados, é [NOME DO CONTROLADOR], inscrito sob o CPF/CNPJ [CPF/CNPJ]. Para falar sobre privacidade, escreva para [E-MAIL DE CONTATO].',
        'O Trampo Já é para maiores de 18 anos. Veja a seção Menores de idade.',
      ],
    },
    {
      titulo: 'Dados que coletamos',
      paragrafos: [
        'Conta: seu e-mail e sua senha. A senha nunca é guardada como você a digitou: o servidor guarda apenas um código irreversível (hash) calculado a partir dela. Cada aparelho em que você entra recebe uma sessão, da qual guardamos só um código irreversível do token de acesso, a data de criação e a data de expiração.',
        'Perfil: nome, cidade, descrição e habilidades, que você mesmo digita. Não pedimos telefone, e o aplicativo não usa a localização do aparelho: a cidade é um texto que você escolhe.',
        'Anúncios: o título, a descrição, a categoria, a cidade, o valor e o prazo dos trampos e dos serviços que você publica.',
        'Candidaturas: a mensagem e o valor que você propõe quando se candidata a um trampo, e a situação da candidatura.',
        'Mensagens: o texto das conversas que você troca com outras pessoas dentro do aplicativo.',
        'Registros de acesso: quando o aplicativo fala com o servidor, o servidor registra o endereço IP, a data e a hora, o método e a rota acessada (sem os valores que você digitou) e o resultado do pedido. Esses registros não incluem e-mail, senha, nome nem o conteúdo de mensagens e anúncios.',
        'No aparelho, o aplicativo guarda o seu token de acesso no armazenamento seguro do sistema (Keychain no iOS, Keystore no Android). O aplicativo não usa telemetria, relatório de falhas, rastreadores nem publicidade.',
      ],
    },
    {
      titulo: 'Para que usamos os dados e em que base legal',
      paragrafos: [
        'Criar e manter a sua conta, mostrar o seu perfil e os seus anúncios, permitir candidaturas e conversas entre as partes e fazer a busca funcionar. A base legal é a execução do contrato de uso do aplicativo (LGPD, art. 7º, V), a pedido de quem se cadastra.',
        'Proteger o serviço e as pessoas que o usam, por exemplo limitando o número de tentativas de login, de cadastros e de envios por minuto e investigando abusos. A base legal é o legítimo interesse (LGPD, art. 7º, IX), sempre com o mínimo de dados necessário.',
        'Guardar os registros de acesso por seis meses, como exige o Marco Civil da Internet (Lei 12.965/2014, art. 15). A base legal é o cumprimento de obrigação legal (LGPD, art. 7º, II).',
        'Não usamos os seus dados para publicidade, para criar perfis comerciais nem para decisões automatizadas sobre você.',
      ],
    },
    {
      titulo: 'Quem vê os seus dados',
      paragrafos: [
        'Seu e-mail nunca aparece para outras pessoas.',
        'Seu perfil (nome, cidade, descrição e habilidades) e os seus anúncios ficam visíveis para as demais pessoas que estão logadas no aplicativo. Quem não tem conta não vê nada.',
        'Quando você se candidata a um trampo, o autor do trampo vê a sua candidatura (mensagem, valor proposto e situação) e o seu perfil.',
        'As mensagens de uma conversa ficam guardadas no servidor e são vistas por você e pela outra pessoa da conversa, e por nenhuma outra pessoa usuária.',
        'Não vendemos nem repassamos os seus dados a terceiros, e não há anúncios nem ferramentas de telemetria. A API e o banco de dados do Trampo Já ficam hospedados em [ENDEREÇO DE HOSPEDAGEM]. Podemos fornecer dados a autoridades quando a lei ou uma ordem judicial exigir.',
      ],
    },
    {
      titulo: 'Por quanto tempo guardamos os dados',
      paragrafos: [
        'Guardamos os dados da sua conta, do seu perfil, dos seus anúncios, das suas candidaturas e das suas conversas enquanto a sua conta existir. Quando você exclui a conta, tudo isso é apagado na hora, como descrito na seção Seus direitos.',
        'Os registros de acesso ficam fora do banco de dados da conta e não são apagados quando você exclui a conta. Eles são guardados por pelo menos seis meses, pelo motivo legal explicado acima. O prazo máximo de guarda e a forma de eliminação dependem da hospedagem do serviço e serão estes: [PRAZO E FORMA DE GUARDA DOS REGISTROS DE ACESSO].',
        'Cópias de segurança do servidor, se existirem, são mantidas por [PRAZO DE CÓPIAS DE SEGURANÇA] e seguem para eliminação depois disso.',
      ],
    },
    {
      titulo: 'Mensagens ficam guardadas',
      paragrafos: [
        'As mensagens enviadas não podem ser apagadas uma a uma, nem por você nem pela outra pessoa da conversa. Pense antes de enviar: o que você escreve fica guardado no servidor e continua visível para a outra pessoa enquanto a conversa existir.',
        'Uma conversa só desaparece quando uma das duas contas é excluída: nesse caso, a conversa inteira, com as mensagens dos dois lados, é apagada para as duas pessoas.',
      ],
    },
    {
      titulo: 'Seus direitos',
      paragrafos: [
        'A LGPD (art. 18) garante a você, entre outros direitos: confirmar que tratamos dados seus, acessá-los, corrigi-los, pedir a eliminação, pedir a portabilidade, saber com quem os compartilhamos e reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
        'Corrigir: edite o seu perfil no próprio aplicativo. Para corrigir outros dados, escreva para [E-MAIL DE CONTATO].',
        'Exportar: em Perfil, Conta e privacidade, você pode gerar um arquivo com os seus dados. É preciso informar a senha. O arquivo está em JSON e traz só os dados da sua conta: e-mail, datas das sessões, perfil, trampos, serviços, candidaturas e as mensagens que você enviou, além do identificador da outra pessoa em cada conversa. Ele não traz a senha, o token nem textos escritos por outras pessoas. O aplicativo grava um arquivo temporário no aparelho, abre a folha de compartilhamento do sistema para você escolher o destino e apaga o arquivo temporário depois.',
        'Excluir: em Perfil, Conta e privacidade, você pode excluir a conta. É preciso informar a senha, e a exclusão é imediata e definitiva, sem prazo de carência e sem como desfazer. Na mesma operação apagamos a conta, as sessões de todos os aparelhos, o perfil, os trampos que você publicou (com as candidaturas que eles receberam), os serviços, as candidaturas que você fez e as conversas de que você participa, com as mensagens dos dois lados.',
        'Efeito sobre a outra pessoa: quem conversava com você perde a conversa inteira, inclusive as mensagens que ela mesma escreveu. Os seus trampos e serviços deixam de aparecer na busca, e as candidaturas que você fez somem da lista de candidaturas recebidas dos autores.',
        'Se não conseguir usar o aplicativo, peça a exclusão ou qualquer outro direito escrevendo para [E-MAIL DE CONTATO]. Podemos pedir informações para confirmar que o pedido é seu. Respondemos no prazo previsto na LGPD.',
      ],
    },
    {
      titulo: 'Segurança',
      paragrafos: [
        'Adotamos medidas técnicas para proteger os seus dados: a senha é guardada apenas como hash; o token de acesso fica no armazenamento seguro do aparelho e, no servidor, só em forma de código irreversível; a comunicação entre o aplicativo e o servidor usa conexão criptografada (HTTPS); há limites de tentativas e de volume por pessoa; e os registros do servidor são configurados para não gravar e-mail, senha, nome nem o conteúdo de mensagens e anúncios.',
        'Nenhum sistema é totalmente seguro. Se houver um incidente que possa causar risco relevante a você, avisaremos você e a ANPD, como a lei determina. Guarde a sua senha em sigilo e saia da conta em aparelhos que não são seus.',
      ],
    },
    {
      titulo: 'Menores de idade',
      paragrafos: [
        'O Trampo Já é para pessoas com 18 anos ou mais. Não coletamos dados de menores de propósito. Se soubermos que uma conta pertence a alguém com menos de 18 anos, podemos excluí-la. Se você acredita que isso aconteceu, avise em [E-MAIL DE CONTATO].',
      ],
    },
    {
      titulo: 'Alterações nesta política',
      paragrafos: [
        'Podemos atualizar esta política. Uma versão nova passa a valer a partir da atualização do aplicativo que a traz. A versão vigente, identificada pela sua data, aparece no topo deste documento. As mudanças valem para frente.',
      ],
    },
    {
      titulo: 'Contato',
      paragrafos: [
        'Controlador: [NOME DO CONTROLADOR], CPF/CNPJ [CPF/CNPJ]. Dúvidas, pedidos e reclamações sobre os seus dados: [E-MAIL DE CONTATO].',
      ],
    },
  ],
};

export const termosDeUso: DocumentoLegal = {
  titulo: 'Termos de Uso',
  versao: '2026-10-22',
  rascunho: true,
  secoes: [
    {
      titulo: 'Sobre o Trampo Já e o aceite',
      paragrafos: [
        'O Trampo Já é um aplicativo, mantido por [NOME DO CONTROLADOR] (CPF/CNPJ [CPF/CNPJ]), que aproxima freelancers e empregadores: você publica trampos, oferece serviços, se candidata e conversa com a outra parte. O aplicativo é só o ponto de encontro.',
        'Ao criar a conta, você concorda com estes termos e com a Política de Privacidade, na versão vigente no dia do cadastro. Se não concordar, não crie a conta.',
      ],
    },
    {
      titulo: 'Quem pode usar',
      paragrafos: [
        'Você precisa ter 18 anos ou mais e capacidade para assumir as obrigações destes termos. O aplicativo não é destinado a menores de idade.',
        'Você declara que os dados que informa são verdadeiros e se compromete a mantê-los atualizados. Cada conta é ligada a um e-mail. Você responde por tudo o que é feito com a sua conta, então mantenha a senha em sigilo e avise em [E-MAIL DE CONTATO] se achar que alguém a usou.',
      ],
    },
    {
      titulo: 'Como o aplicativo funciona',
      paragrafos: [
        'A busca e os detalhes de trampos, serviços e perfis só estão disponíveis para quem tem conta e está logado. Para publicar um trampo, oferecer um serviço ou se candidatar, é preciso ter o perfil completo, com nome, cidade e ao menos uma habilidade.',
        'O seu perfil e os seus anúncios ficam visíveis para as outras pessoas logadas. O seu e-mail não aparece para ninguém. A Política de Privacidade explica o que é guardado e por quanto tempo.',
        'Só é possível conversar com quem tem vínculo com você por uma candidatura ou por uma contratação. As mensagens ficam guardadas e não podem ser apagadas uma a uma.',
      ],
    },
    {
      titulo: 'Negociação entre as partes',
      paragrafos: [
        'Quem publica e quem se candidata ou contrata combina diretamente entre si o escopo, o prazo, o valor, a forma e o momento do pagamento. O Trampo Já não intermedeia pagamento: não recebe, não guarda, não repassa nem garante nenhum valor.',
        'O Trampo Já não é parte do negócio, não é empregador nem agência, não cria vínculo de trabalho entre as partes e não garante a qualidade do serviço, a veracidade dos anúncios, o pagamento nem a identidade de ninguém. Cada pessoa responde pelo que combina, pelos documentos, tributos e obrigações da atividade e pelas consequências da negociação.',
        'Use o bom senso: desconfie de pedidos de dinheiro adiantado, de pressa fora do normal e de propostas que pareçam boas demais, e não compartilhe dados sensíveis sem necessidade.',
      ],
    },
    {
      titulo: 'O que você publica',
      paragrafos: [
        'Você é o único responsável pelos textos, valores e informações que publica ou envia, como perfil, trampos, serviços, candidaturas e mensagens, e declara ter o direito de usá-los.',
        'Você nos autoriza a guardar esse conteúdo e a exibi-lo dentro do aplicativo para as pessoas que podem vê-lo, conforme a Política de Privacidade, apenas para o aplicativo funcionar. O conteúdo continua sendo seu, e essa autorização termina quando você o apaga ou exclui a conta, ressalvado o que a lei nos obriga a guardar.',
      ],
    },
    {
      titulo: 'Condutas proibidas',
      paragrafos: [
        'É proibido publicar ou enviar conteúdo ilegal, falso ou enganoso, e oferecer ou procurar trabalho que seja ilegal ou que envolva menores de idade.',
        'É proibido discriminar, ameaçar, assediar, ofender ou expor outras pessoas, inclusive por mensagem.',
        'É proibido praticar golpe ou fraude, o que inclui pedir pagamento adiantado para dar acesso a um trabalho, se passar por outra pessoa ou por empresa e criar contas falsas.',
        'É proibido enviar spam, mensagens em massa ou propaganda que não tenha relação com o trampo ou o serviço em questão.',
        'É proibido publicar dados pessoais de terceiros sem autorização e usar dados de outras pessoas, obtidos no aplicativo, para outra finalidade que não seja a negociação em questão.',
        'É proibido tentar acessar contas ou dados de outras pessoas, burlar os limites e as proteções do aplicativo, extrair dados em massa ou usar robôs e outros meios automatizados, ou interferir no funcionamento do servidor.',
        'Se encontrar algo que viole estes termos, avise em [E-MAIL DE CONTATO].',
      ],
    },
    {
      titulo: 'Disponibilidade e limites de uso',
      paragrafos: [
        'O aplicativo é oferecido como está, sem promessa de funcionamento ininterrupto. Podemos fazer manutenção, mudar funções, aplicar limites de volume por pessoa e recusar pedidos acima desses limites, a fim de proteger o serviço.',
      ],
    },
    {
      titulo: 'Encerramento da conta',
      paragrafos: [
        'Você pode excluir a sua conta quando quiser, em Perfil, Conta e privacidade, informando a senha. A exclusão é imediata e definitiva, e apaga a conta, as sessões, o perfil, os anúncios, as candidaturas e as conversas, inclusive as mensagens da outra pessoa nas conversas de que você participa, como descrito na Política de Privacidade.',
        'Podemos suspender ou excluir uma conta que viole estes termos ou a lei, ou que coloque outras pessoas em risco, com ou sem aviso prévio, conforme a gravidade.',
        'Depois do encerramento continuam valendo as partes destes termos que, por natureza, devem continuar, como a responsabilidade pelas negociações já feitas.',
      ],
    },
    {
      titulo: 'Responsabilidade',
      paragrafos: [
        'Na extensão permitida pela lei, não respondemos por perdas ou danos que decorram de negociações entre as partes, de conteúdo publicado por usuários, de condutas de outras pessoas ou de indisponibilidade do aplicativo. Nada nestes termos afasta direitos que a lei não permite afastar.',
      ],
    },
    {
      titulo: 'Alterações nos termos',
      paragrafos: [
        'Podemos atualizar estes termos. Uma versão nova passa a valer a partir da atualização do aplicativo que a traz. A versão vigente, identificada pela sua data, aparece no topo deste documento. As mudanças valem para frente.',
      ],
    },
    {
      titulo: 'Lei aplicável e foro',
      paragrafos: [
        'Estes termos seguem as leis do Brasil. Fica eleito o foro de [FORO] para resolver conflitos, ressalvado o direito de o consumidor, quando for o caso, ajuizar a ação no foro do seu domicílio.',
        'Contato: [NOME DO CONTROLADOR], CPF/CNPJ [CPF/CNPJ], [E-MAIL DE CONTATO].',
      ],
    },
  ],
};
