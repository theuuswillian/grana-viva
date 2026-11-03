# site.py (v10.82): gera as páginas públicas em site/ (estáticas, pt-BR) a partir de planos.js (fonte única dos planos).
# uso: python3 site.py          (rodar de novo sempre que planos.js ou estes textos mudarem)
# O app continua em ./ (start_url do app instalado). As páginas ficam em ./site/ e não usam JavaScript.
import json, os, subprocess, html, datetime
RAIZ = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RAIZ, 'site')
P = json.loads(subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1])))', os.path.join(RAIZ, 'planos.js')]))
PL, REC, LIM = P['PLANOS'], P['RECURSOS'], P['LIMITES']
EMAIL = 'matheuswillian982018@gmail.com'
VIGENCIA = '1º de novembro de 2026'
e = html.escape

def brl(v):
    s = f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return 'R$ ' + (s[:-3] if s.endswith(',00') else s)

NAV = [('funcionalidades.html', 'Funcionalidades'), ('precos.html', 'Planos e preços'), ('sobre.html', 'Sobre'), ('faq.html', 'Dúvidas')]

def pagina(arq, titulo, descricao, corpo, atual=None):
    nav = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if h == atual else ""}>{t}</a>' for h, t in NAV)
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
<meta name="theme-color" content="#050d0a">
<link rel="icon" href="../icons/icon-192.png">
<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
<link rel="stylesheet" href="site.css">
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo"><div class="lim topoIn">
  <a class="marca" href="./"><img src="../icons/icon-192.png" alt="" width="28" height="28">GranaViva</a>
  <nav class="menu" aria-label="Páginas">{nav}</nav>
  <a class="btn btnP topoBtn" href="../">Abrir o app</a>
</div></header>
<main id="conteudo">
{corpo}
</main>
<footer class="rodape"><div class="lim rodIn">
  <div><a class="marca" href="./"><img src="../icons/icon-192.png" alt="" width="24" height="24">GranaViva</a><p>Controle financeiro pessoal, feito no Brasil.</p></div>
  <nav aria-label="Rodapé"><a href="funcionalidades.html">Funcionalidades</a><a href="precos.html">Planos e preços</a><a href="sobre.html">Sobre</a><a href="faq.html">Dúvidas</a><a href="privacidade.html">Política de privacidade</a><a href="termos.html">Termos de uso</a><a href="mailto:{EMAIL}">Contato</a></nav>
</div></footer>
</body>
</html>
'''

# ---------- conteúdo compartilhado ----------
def card_plano(id, destaque=False):
    p = PL[id]
    itens = {
        'gratis': ['Lançamentos manuais de receitas e despesas', 'Contas e bancos, com transferências', 'Categorias personalizadas', 'Cartões, faturas e parcelas', 'Início com o resumo do mês', 'Alertas de vencimento no celular', 'Exportar e excluir seus dados'],
        'plus': ['Tudo do Grátis', 'Planejamento e projeção de saldo', 'Orçamentos por categoria', 'Metas com ritmo e rendimento pelo CDI', 'Relatórios completos e resumo do mês', 'Importar extrato OFX/CSV e anexar comprovantes', f'Lançar com IA ({LIM[1]["leitura_ia_dia"]} por dia)'],
        'pro': ['Tudo do Plus', 'Investimentos: FIIs, renda fixa pelo CDI e cotações', 'Patrimônio líquido mês a mês', f'Assistente com IA ({LIM[2]["assistente_dia"]} perguntas por dia)', f'Lançar com IA ({LIM[2]["leitura_ia_dia"]} por dia)'],
    }[id]
    preco = 'R$ 0' if id == 'gratis' else brl(p['preco'])
    sufixo = 'para sempre' if id == 'gratis' else '/mês'
    extra = f'<p class="pAnual">ou {brl(PL["pro_anual"]["preco"])}/ano no Pro anual</p>' if id == 'pro' else ''
    li = ''.join(f'<li>{e(x)}</li>' for x in itens)
    return f'''<article class="plano{' destaque' if destaque else ''}">
  <h3>{e(p['nome'])}</h3>
  <p class="preco">{preco}<small>{sufixo}</small></p>{extra}
  <ul class="checks">{li}</ul>
</article>'''

def grade_planos():
    return f'<div class="planos">{card_plano("gratis")}{card_plano("plus")}{card_plano("pro", True)}</div>'

NOTA_PAG = '<p class="aviso"><strong>Pagamentos em breve.</strong> As assinaturas ainda não estão abertas. Toda conta nova ganha 14 dias do Pro para testar tudo, sem cartão. Depois, continua no Grátis e nada do que você registrou é apagado.</p>'

def shots():
    s = [('inicio', 'Início: saldo, entradas e saídas do mês e atalhos'), ('planejamento', 'Planejamento: projeção do saldo para os próximos meses'), ('cartoes', 'Cartões: fatura aberta, limite e parcelas')]
    figs = ''.join(f'<figure class="shot"><img src="img/{n}.webp" alt="{e(t)}" width="402" height="800" loading="lazy"><figcaption>{e(t)}</figcaption></figure>' for n, t in s)
    return f'<div class="shots">{figs}</div><p class="nota">Telas reais do app, preenchidas com dados de exemplo (não são dados de clientes).</p>'

# ---------- páginas ----------
def landing():
    return pagina('index.html', 'GranaViva · controle financeiro pessoal', 'Organize receitas, despesas, cartões, contas e metas em um só lugar. App em português, funciona no celular e no computador.', f'''
<section class="hero"><div class="lim heroIn">
  <div>
    <p class="selo">Feito no Brasil · em português</p>
    <h1>Seu dinheiro organizado, sem planilha.</h1>
    <p class="lead">Registre gastos e receitas em segundos, acompanhe faturas de cartão e veja quanto vai sobrar no fim do mês. Funciona no celular e no computador, e pode ser instalado como app.</p>
    <div class="ctas"><a class="btn btnP" href="../">Criar conta grátis</a><a class="btn btnS" href="precos.html">Ver planos</a></div>
    <p class="mini">14 dias do Pro grátis, sem cartão. Depois você escolhe.</p>
  </div>
</div></section>
<section class="lim bloco">
  <h2>O que o GranaViva faz</h2>
  <div class="grade3">
    <div class="item"><h3>Lançamentos rápidos</h3><p>Despesas, receitas e transferências entre contas. Marque como pago ou previsto, divida entre categorias e use tags.</p></div>
    <div class="item"><h3>Cartões e faturas</h3><p>Compras parceladas caem na fatura certa, com fechamento, vencimento e limite usado sempre à vista.</p></div>
    <div class="item"><h3>Planejamento</h3><p>Projeção do saldo para 3, 6 e 12 meses com suas contas fixas, e um calendário do saldo dia a dia.</p></div>
    <div class="item"><h3>Orçamentos e alertas</h3><p>Limites por categoria e aviso no celular quando uma fatura vai vencer ou um orçamento chega a 80%.</p></div>
    <div class="item"><h3>Investimentos e metas</h3><p>FIIs com cotação da B3 (com atraso de cerca de 15 minutos), renda fixa calculada pelo CDI e metas com ritmo mensal.</p></div>
    <div class="item"><h3>IA que ajuda, sem inventar</h3><p>Lance um gasto por foto do comprovante ou por uma frase, e pergunte sobre seu dinheiro. As respostas são conferidas com os seus números.</p></div>
  </div>
</section>
<section class="lim bloco">
  <h2>Veja como é</h2>
  {shots()}
</section>
<section class="lim bloco">
  <h2>Seus dados são seus</h2>
  <div class="grade3">
    <div class="item"><h3>Só você vê</h3><p>Cada conta acessa apenas os próprios dados, por regras de segurança no banco de dados.</p></div>
    <div class="item"><h3>Sem anúncios</h3><p>Não vendemos nem alugamos seus dados e não usamos rastreadores de publicidade.</p></div>
    <div class="item"><h3>Leve com você</h3><p>Exporte tudo (JSON e planilha) ou exclua sua conta e todos os dados quando quiser, em Ajustes.</p></div>
  </div>
  <p><a href="privacidade.html">Leia a Política de privacidade</a></p>
</section>
<section class="lim bloco">
  <h2>Planos</h2>
  {grade_planos()}
  {NOTA_PAG}
  <p><a href="precos.html">Comparar todos os recursos</a></p>
</section>
<section class="lim bloco final">
  <h2>Comece agora</h2>
  <p>Crie sua conta com e-mail ou Google. Leva menos de um minuto.</p>
  <a class="btn btnP" href="../">Abrir o GranaViva</a>
</section>''')

def funcionalidades():
    def g(nivel, titulo, itens):
        li = ''.join(f'<div class="item"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in itens)
        return f'<section class="lim bloco"><h2>{titulo} <span class="tag">{e([PL["gratis"]["nome"], PL["plus"]["nome"], PL["pro"]["nome"]][nivel])}</span></h2><div class="grade3">{li}</div></section>'
    corpo = '<section class="lim cab"><h1>Funcionalidades</h1><p class="lead">Tudo o que o GranaViva faz hoje, separado pelo plano em que aparece.</p></section>'
    corpo += g(0, 'Controle do dia a dia', [
        ('Lançamentos', 'Receitas, despesas e transferências, com status pago, previsto ou cancelado. Só o que está pago entra no saldo.'),
        ('Dividir entre categorias', 'Um gasto pode ser dividido em até 10 partes, em categorias diferentes, com os centavos sempre exatos.'),
        ('Contas fixas e recorrências', 'Diária, semanal, quinzenal, mensal, anual ou a cada N dias, com data de início e fim.'),
        ('Contas e bancos', 'Saldo de cada conta, transferências entre elas e contas arquivadas que continuam no histórico.'),
        ('Categorias, subcategorias e tags', 'Organize do seu jeito e filtre a lista por tag, texto ou período.'),
        ('Alertas no celular', 'Avisos de fatura a vencer ou atrasada e contas do dia (no iPhone, com o app instalado).'),
        ('Instale como app', 'Funciona no navegador e pode ser instalado na tela inicial; abre mesmo sem internet com a última cópia.'),
        ('PIN e Face ID', 'Trave o app com PIN e, nos aparelhos compatíveis, desbloqueie com biometria.'),
        ('Exportar e excluir', 'Baixe todos os seus dados (JSON e planilha) ou exclua a conta inteira em Ajustes.'),
    ])
    corpo += g(1, 'Planejar e enxergar o mês', [
        ('Cartões e faturas', 'Compras e parcelas na fatura certa, fechamento e vencimento, limite usado, juros e multa de atraso.'),
        ('Orçamentos', 'Limite por categoria em cada mês, histórico de planejado x gasto e aviso em 80% e 100%.'),
        ('Planejamento', 'Projeção de 3, 6 e 12 meses, simulação de renda extra ou cortes e saldo dia a dia.'),
        ('Relatórios', 'Comparação com o mês anterior, ritmo de gastos, variação por categoria e resumo do mês.'),
        ('Importar extrato', 'Arquivos OFX ou CSV do banco, com sugestão de categoria e sem duplicar lançamentos.'),
        ('Comprovantes', 'Anexe fotos e PDFs aos lançamentos, guardados em um espaço privado da sua conta.'),
        ('Lançar com IA', f'Foto do comprovante ou uma frase ("gastei 32 no mercado ontem") viram um lançamento para você conferir. Até {LIM[1]["leitura_ia_dia"]} por dia.'),
    ])
    corpo += g(2, 'Investimentos, patrimônio e metas', [
        ('FIIs e cotações', 'Carteira de fundos imobiliários com cotação da B3 (atraso de cerca de 15 minutos), proventos e preço médio.'),
        ('Renda fixa pelo CDI', 'CDB, LCI/LCA, Tesouro, caixinhas e poupança calculados com as taxas oficiais do Banco Central, dias úteis e IR.'),
        ('Patrimônio', 'Contas, investimentos e bens menos dívidas e faturas, com histórico mês a mês.'),
        ('Metas', 'Quanto guardar por mês, previsão de chegada e metas que rendem pelo CDI.'),
        ('Assistente com IA', f'Pergunte "quanto gastei com mercado em outubro?". O app calcula com os seus dados e a resposta é conferida. Até {LIM[2]["assistente_dia"]} perguntas por dia. Não é recomendação de investimento.'),
    ])
    corpo += '<section class="lim bloco final"><a class="btn btnP" href="precos.html">Ver planos e preços</a></section>'
    return pagina('funcionalidades.html', 'Funcionalidades · GranaViva', 'Lançamentos, cartões e faturas, planejamento, orçamentos, investimentos, metas e IA no GranaViva.', corpo, 'funcionalidades.html')

def precos():
    linhas = ''
    for k, r in REC.items():
        cel = ''.join(f'<td>{"<span class=sim>Sim</span>" if r["nivel"] <= n else "<span class=nao>Não</span>"}</td>' for n in (0, 1, 2))
        linhas += f'<tr><th scope="row">{e(r["nome"])}</th>{cel}</tr>'
    linhas += '<tr><th scope="row">Leituras com IA por dia</th>' + ''.join(f'<td>{LIM[n]["leitura_ia_dia"] or "Não"}</td>' for n in (0, 1, 2)) + '</tr>'
    linhas += '<tr><th scope="row">Perguntas ao assistente por dia</th>' + ''.join(f'<td>{LIM[n]["assistente_dia"] or "Não"}</td>' for n in (0, 1, 2)) + '</tr>'
    corpo = f'''<section class="lim cab"><h1>Planos e preços</h1><p class="lead">Comece grátis. Assine só se precisar de mais.</p></section>
<section class="lim bloco">{grade_planos()}{NOTA_PAG}</section>
<section class="lim bloco"><h2>Compare os recursos</h2>
<div class="tabelaW"><table class="tabela"><thead><tr><th scope="col">Recurso</th><th scope="col">{e(PL["gratis"]["nome"])}<small>R$ 0</small></th><th scope="col">{e(PL["plus"]["nome"])}<small>{brl(PL["plus"]["preco"])}/mês</small></th><th scope="col">{e(PL["pro"]["nome"])}<small>{brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano</small></th></tr></thead><tbody>{linhas}</tbody></table></div>
</section>
<section class="lim bloco"><h2>Como funciona a cobrança</h2>
<ul class="lista">
<li>Assinatura mensal ou anual, cobrada pelo Mercado Pago (Pix ou cartão, conforme as opções que o Mercado Pago oferecer no pagamento).</li>
<li>O GranaViva não recebe nem guarda os dados do seu cartão.</li>
<li>Cancele quando quiser em Ajustes. O acesso continua até o fim do período já pago.</li>
<li>Se desistir em até 7 dias da primeira assinatura, devolvemos o valor pago.</li>
<li>Ao voltar para o Grátis, nada é apagado: os recursos pagos ficam escondidos e voltam se você assinar de novo.</li>
</ul>
<p>Mais detalhes nos <a href="termos.html">Termos de uso</a>.</p></section>'''
    return pagina('precos.html', 'Planos e preços · GranaViva', f'Grátis, Plus por {brl(PL["plus"]["preco"])}/mês e Pro por {brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano.', corpo, 'precos.html')

def sobre():
    corpo = f'''<section class="lim cab"><h1>Sobre</h1><p class="lead">O GranaViva nasceu de uma necessidade simples: saber para onde o dinheiro vai e quanto vai sobrar, sem planilha.</p></section>
<section class="lim bloco texto">
<p>O GranaViva é um app de controle financeiro pessoal feito no Brasil, em português, pensado para o jeito brasileiro de lidar com dinheiro: Pix, cartão com fatura e parcelas, contas fixas, caixinhas que rendem pelo CDI e fundos imobiliários.</p>
<p>É desenvolvido de forma independente por Matheus Willian, em Brasília (DF). Não há investidores nem anúncios: o projeto se sustenta pelas assinaturas dos planos pagos.</p>
<h2>No que acreditamos</h2>
<ul class="lista">
<li><strong>Seus dados são seus.</strong> Você pode exportar tudo ou excluir sua conta a qualquer momento.</li>
<li><strong>Números certos.</strong> As contas são feitas em centavos, sem arredondamentos escondidos, e o que é estimativa aparece como estimativa.</li>
<li><strong>IA com responsabilidade.</strong> A IA ajuda a lançar e a responder perguntas, mas as respostas são conferidas com os seus números e ela não mexe em nada sozinha.</li>
<li><strong>Simples por padrão.</strong> O básico é grátis e continua grátis.</li>
</ul>
<h2>Fale com a gente</h2>
<p>Dúvidas, sugestões ou pedidos sobre seus dados: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
</section>'''
    return pagina('sobre.html', 'Sobre · GranaViva', 'Quem faz o GranaViva e no que acreditamos.', corpo, 'sobre.html')

FAQ = [
    ('O GranaViva é grátis?', 'Sim. O plano Grátis não tem prazo e inclui lançamentos, contas, categorias, cartões e faturas, o resumo do mês e alertas. Os planos Plus e Pro liberam planejamento, relatórios, metas, investimentos e IA.'),
    ('O que acontece depois dos 14 dias de teste?', 'Sua conta passa para o Grátis automaticamente. Nada é cobrado e nada do que você registrou é apagado. Os recursos pagos ficam escondidos e voltam se você assinar.'),
    ('Já posso assinar?', 'Ainda não. Os pagamentos estão sendo preparados e serão feitos pelo Mercado Pago. Enquanto isso, o botão de assinar aparece como "Pagamento em breve".'),
    ('Como cancelo a assinatura?', 'Em Ajustes, no app. O acesso continua até o fim do período já pago e você não é cobrado de novo.'),
    ('Meus dados estão seguros?', 'Os dados ficam em um banco de dados na nuvem (Supabase) com regras que deixam cada conta ver apenas os próprios dados, conexão sempre criptografada (HTTPS) e uma cópia criptografada no seu aparelho. Nenhum sistema é 100% imune a falhas, mas tratamos segurança como prioridade.'),
    ('Vocês vendem meus dados ou mostram anúncios?', 'Não. Não vendemos nem alugamos dados e não há anúncios.'),
    ('A IA lê meus dados?', 'Só quando você usa um recurso de IA. Na leitura de comprovante, a foto ou o texto vai para a IA do Google (Gemini) para montar o lançamento. No assistente, vão a pergunta e os totais calculados pelo app, não a lista dos seus lançamentos. Veja os detalhes na Política de privacidade.'),
    ('Funciona sem internet?', 'O app abre com a última cópia salva no aparelho e guarda o que você lançar para enviar quando a conexão voltar.'),
    ('Como instalo no celular?', 'No iPhone, abra o app no Safari, toque em Compartilhar e em "Adicionar à Tela de Início". No Android, abra no Chrome e toque em "Instalar app" ou "Adicionar à tela inicial".'),
    ('Conecta com o meu banco?', 'Você pode importar o extrato em OFX ou CSV (planos Plus e Pro). Existe também uma conexão bancária opcional pela Pluggy, que precisa ser ativada por você.'),
    ('Como exporto ou excluo meus dados?', 'Em Ajustes, em "Privacidade e seus dados": exportar baixa tudo em JSON e planilha; excluir apaga a conta, os lançamentos e os comprovantes de forma definitiva.'),
    ('O GranaViva dá recomendação de investimento?', 'Não. Os números de investimentos são cálculos e estimativas para você acompanhar sua carteira. Não são recomendação de compra ou venda.'),
]
def faq():
    itens = ''.join(f'<details class="faqI"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in FAQ)
    corpo = f'''<section class="lim cab"><h1>Dúvidas frequentes</h1></section>
<section class="lim bloco faq">{itens}</section>
<section class="lim bloco"><p>Não achou sua resposta? Escreva para <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></section>'''
    return pagina('faq.html', 'Dúvidas frequentes · GranaViva', 'Respostas sobre planos, teste grátis, segurança, IA, instalação e seus dados no GranaViva.', corpo, 'faq.html')

def privacidade():
    corpo = f'''<section class="lim cab"><h1>Política de privacidade</h1><p class="lead">Como o GranaViva trata os seus dados pessoais. Vigente a partir de {VIGENCIA}.</p></section>
<section class="lim bloco texto legal">
<h2>1. Quem é o responsável</h2>
<p>O GranaViva é mantido por Matheus Willian, desenvolvedor independente em Brasília (DF), que é o controlador dos dados pessoais tratados no app, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD"). Para qualquer assunto sobre seus dados, inclusive como encarregado, o contato é <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>

<h2>2. Quais dados tratamos</h2>
<ul class="lista">
<li><strong>Conta:</strong> e-mail, senha (guardada pelo serviço de autenticação em forma cifrada, nunca em texto) e, se você entrar com o Google, o nome e a foto que o Google envia.</li>
<li><strong>Dados financeiros que você registra:</strong> lançamentos, valores, datas, descrições, categorias, tags, observações, contas e saldos, cartões (nome, limite, fechamento e vencimento, nunca o número do cartão), orçamentos, metas, investimentos, bens, dívidas e empréstimos, inclusive nomes de pessoas que você escolher registrar.</li>
<li><strong>Arquivos:</strong> fotos e PDFs de comprovantes que você anexar.</li>
<li><strong>Notificações:</strong> se você ativar, o endereço técnico de notificação do seu navegador.</li>
<li><strong>Uso técnico e segurança:</strong> contadores de uso dos recursos de IA e limites por hora, para evitar abuso.</li>
<li><strong>Plano e pagamento:</strong> plano, situação da assinatura, datas e identificadores da assinatura e do pagador no Mercado Pago. Os dados do cartão são digitados no Mercado Pago e não chegam ao GranaViva.</li>
<li><strong>Conexão bancária (opcional):</strong> se você ativar, as credenciais de acesso à Pluggy (guardadas criptografadas) e as contas e transações que a Pluggy enviar.</li>
<li><strong>No seu aparelho:</strong> uma cópia dos seus dados para o app abrir rápido e funcionar sem internet, guardada criptografada, além de preferências como tema e PIN (o PIN é guardado em forma de hash).</li>
</ul>
<p>Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros. O armazenamento local do navegador é usado apenas para o app funcionar (sessão, preferências e a cópia criptografada).</p>

<h2>3. Para que usamos e com qual base legal</h2>
<ul class="lista">
<li><strong>Prestar o serviço que você contratou</strong> (guardar, sincronizar, calcular e mostrar seus dados; ler comprovantes e responder perguntas quando você pede; cobrar a assinatura): execução de contrato (art. 7º, V).</li>
<li><strong>Segurança e prevenção de abuso</strong> (limites de uso, registros técnicos): legítimo interesse (art. 7º, IX).</li>
<li><strong>Notificações no celular e conexão bancária:</strong> seu consentimento (art. 7º, I), que você pode retirar a qualquer momento desligando o recurso em Ajustes.</li>
<li><strong>Cumprir obrigações legais</strong>, quando houver (art. 7º, II).</li>
</ul>
<p>Não vendemos, alugamos ou usamos seus dados para publicidade.</p>

<h2>4. Com quem os dados são compartilhados</h2>
<p>Usamos empresas que tratam dados em nosso nome (operadores), apenas no necessário para cada função:</p>
<ul class="lista">
<li><strong>Supabase</strong> (banco de dados, autenticação, arquivos e funções do servidor). Servidores nos Estados Unidos.</li>
<li><strong>Google</strong>: o login com Google, se você escolher; e a IA <strong>Gemini</strong>, quando você usa a leitura de comprovante, o lançamento por frase ou o assistente. Na leitura, vai a foto, o PDF ou o texto que você enviou; no assistente, vai a pergunta e os totais calculados pelo app. Hoje usamos o nível gratuito da API do Gemini, cujos termos permitem que o Google use esse conteúdo para melhorar seus produtos. Por isso, evite enviar documentos com dados que você não quer compartilhar e não use os recursos de IA se não concordar.</li>
<li><strong>Pluggy</strong>, somente se você ativar a conexão bancária.</li>
<li><strong>Mercado Pago</strong>, para processar as assinaturas pagas, quando estiverem disponíveis. O Mercado Pago trata os dados de pagamento conforme a política de privacidade dele.</li>
<li><strong>GitHub Pages</strong>, que hospeda o site e o app e pode registrar dados técnicos de acesso (como endereço IP).</li>
</ul>
<p>Consultas de cotações e taxas (B3 via servidor, brapi, CoinGecko e Banco Central) enviam apenas códigos de ativos ou séries, sem dados da sua conta.</p>
<p>Alguns desses serviços ficam fora do Brasil, o que caracteriza transferência internacional de dados. Essas transferências são feitas para prestar o serviço que você pediu e com fornecedores que oferecem garantias contratuais de proteção.</p>
<p>Também podemos compartilhar dados se formos obrigados por lei ou por ordem de autoridade competente.</p>

<h2>5. Por quanto tempo guardamos</h2>
<ul class="lista">
<li>Seus dados ficam guardados enquanto a sua conta existir.</li>
<li>Ao excluir a conta em Ajustes, apagamos na hora o login, todos os lançamentos e demais registros e os comprovantes. Se houver assinatura paga ativa, ela é cancelada antes.</li>
<li>Cópias de segurança mantidas pelo provedor de nuvem podem guardar dados por um período limitado, até serem substituídas.</li>
<li>Contadores de uso e limites são de curta duração e apagados junto com a conta.</li>
<li>Registros de pagamento mantidos pelo Mercado Pago seguem a política e as obrigações legais dele.</li>
</ul>

<h2>6. Seus direitos</h2>
<p>Pela LGPD (art. 18), você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; eliminação dos dados tratados com consentimento; informação sobre com quem compartilhamos; e revogação do consentimento.</p>
<p>Você mesmo pode, no app: <strong>exportar</strong> todos os seus dados (JSON e planilha) e <strong>excluir</strong> a conta em Ajustes; <strong>corrigir</strong> qualquer registro editando-o; e desligar notificações e a conexão bancária. Para os demais pedidos, escreva para <a href="mailto:{EMAIL}">{EMAIL}</a>. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

<h2>7. Segurança</h2>
<p>Usamos conexão criptografada (HTTPS), regras no banco de dados que deixam cada conta acessar apenas os próprios dados, armazenamento privado para comprovantes, segredos de integrações guardados criptografados no servidor, cópia local criptografada no aparelho e trava opcional por PIN ou biometria. Nenhum sistema é totalmente imune a falhas; se ocorrer um incidente de segurança que possa causar risco ou dano relevante, avisaremos você e a ANPD.</p>

<h2>8. Crianças e adolescentes</h2>
<p>O GranaViva é destinado a maiores de 18 anos.</p>

<h2>9. Mudanças nesta política</h2>
<p>Se mudarmos esta política de forma relevante, avisaremos no app antes de a mudança valer.</p>
</section>'''
    return pagina('privacidade.html', 'Política de privacidade · GranaViva', 'Quais dados o GranaViva trata, para quê, com quem compartilha, por quanto tempo e como exercer seus direitos.', corpo)

def termos():
    corpo = f'''<section class="lim cab"><h1>Termos de uso</h1><p class="lead">Regras para usar o GranaViva. Vigentes a partir de {VIGENCIA}.</p></section>
<section class="lim bloco texto legal">
<h2>1. Aceitação</h2>
<p>Ao criar uma conta ou usar o GranaViva, você concorda com estes Termos e com a <a href="privacidade.html">Política de privacidade</a>. Se não concordar, não use o app.</p>

<h2>2. O que é o GranaViva</h2>
<p>O GranaViva é um aplicativo de controle financeiro pessoal mantido por Matheus Willian, em Brasília (DF). Ele ajuda você a registrar e organizar suas finanças. <strong>O GranaViva não é banco, corretora nem consultoria</strong>: não movimenta seu dinheiro e não faz recomendação de investimentos.</p>

<h2>3. Sua conta</h2>
<ul class="lista">
<li>Você precisa ter 18 anos ou mais.</li>
<li>Informe um e-mail válido e mantenha sua senha em segredo. Você é responsável pelo que for feito com a sua conta.</li>
<li>Os dados que você registra são seus. Você nos autoriza a tratá-los apenas para prestar o serviço, conforme a Política de privacidade.</li>
</ul>

<h2>4. Planos, teste e pagamento</h2>
<ul class="lista">
<li>O plano <strong>Grátis</strong> não tem prazo. Os planos <strong>Plus</strong> ({brl(PL["plus"]["preco"])}/mês) e <strong>Pro</strong> ({brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano) liberam mais recursos, descritos na página <a href="precos.html">Planos e preços</a>.</li>
<li>Contas novas recebem 14 dias do Pro para teste, sem cartão e sem cobrança. Ao fim do teste a conta passa para o Grátis.</li>
<li>As assinaturas são cobradas de forma recorrente (mensal ou anual) pelo Mercado Pago, que processa o pagamento. O GranaViva não recebe os dados do seu cartão.</li>
<li>Você pode cancelar a qualquer momento em Ajustes. O cancelamento interrompe as próximas cobranças e o acesso pago continua até o fim do período já pago.</li>
<li>Você pode desistir da primeira assinatura em até 7 dias da contratação e receber de volta o valor pago, escrevendo para <a href="mailto:{EMAIL}">{EMAIL}</a>.</li>
<li>Se um pagamento não for aprovado, a conta volta ao Grátis depois de um curto período de tolerância.</li>
<li>Mudanças de preço serão avisadas com pelo menos 30 dias de antecedência e valem a partir da cobrança seguinte.</li>
<li>Ao passar para um plano menor, nenhum dado é apagado: os recursos do plano anterior ficam indisponíveis até você assinar de novo.</li>
<li>Contas criadas antes do lançamento dos planos ("contas fundadoras") mantêm acesso completo sem cobrança.</li>
</ul>

<h2>5. Cálculos, cotações e IA</h2>
<ul class="lista">
<li>Saldos, projeções, rendimentos, impostos estimados e cotações são cálculos feitos a partir do que você registra e de fontes públicas, que podem ter atraso (as cotações da B3 têm cerca de 15 minutos de atraso). Confira valores importantes na fonte oficial (seu banco, corretora ou a Receita Federal).</li>
<li>Os recursos de IA podem errar. A leitura de comprovante sempre abre o lançamento para você conferir antes de salvar, e o assistente não altera nada no app.</li>
<li>Nada no GranaViva é oferta, recomendação ou consultoria de investimento.</li>
</ul>

<h2>6. Uso permitido</h2>
<p>Não é permitido: tentar acessar dados de outras pessoas; contornar limites, planos ou travas de segurança; sobrecarregar ou atacar o serviço; usar o app para atividade ilegal; ou copiar e revender o serviço. Podemos suspender contas que descumpram estas regras.</p>

<h2>7. Disponibilidade</h2>
<p>Trabalhamos para manter o GranaViva disponível e seus dados seguros, mas o serviço depende de internet e de fornecedores (como Supabase, Google e Mercado Pago) e pode ter interrupções. Recomendamos exportar seus dados de tempos em tempos.</p>

<h2>8. Responsabilidade</h2>
<p>Respeitados os direitos que a lei garante ao consumidor, o GranaViva não se responsabiliza por decisões financeiras tomadas com base nas informações do app nem por dados registrados de forma incorreta pelo usuário.</p>

<h2>9. Encerramento</h2>
<p>Você pode excluir sua conta a qualquer momento em Ajustes. Se o GranaViva deixar de existir, avisaremos com antecedência para que você possa exportar seus dados.</p>

<h2>10. Mudanças nestes Termos</h2>
<p>Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no app antes de valer.</p>

<h2>11. Lei e foro</h2>
<p>Estes Termos seguem a lei brasileira, incluindo o Código de Defesa do Consumidor. Fica eleito o foro do domicílio do consumidor.</p>

<h2>12. Contato</h2>
<p><a href="mailto:{EMAIL}">{EMAIL}</a></p>
</section>'''
    return pagina('termos.html', 'Termos de uso · GranaViva', 'Regras de uso do GranaViva: conta, planos, pagamento, cancelamento, IA e responsabilidades.', corpo)

CSS = r'''/* GranaViva · páginas públicas (gerado por site.py). Mesmas cores e fonte do app. */
@font-face{font-family:'Inter';font-weight:400;font-display:swap;src:url(../fonts/inter-400-lat.woff2) format('woff2')}
@font-face{font-family:'Inter';font-weight:600;font-display:swap;src:url(../fonts/inter-600-lat.woff2) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;font-display:swap;src:url(../fonts/inter-700-lat.woff2) format('woff2')}
:root{--bg:#0a0a0c;--card:#1a1a1e;--card2:#101012;--txt:#e7e7ea;--mut:#9ca3af;--hd:#fff;--line:#26262c;--ac:#22c55e;--ac2:#8b5cf6}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-wrap:break-word}
a{color:var(--ac)}
img{max-width:100%;height:auto}
.pular{position:absolute;left:-999px;top:0;background:var(--ac);color:#000;padding:8px 12px;z-index:9}
.pular:focus{left:8px}
.lim{max-width:1080px;margin:0 auto;padding:0 20px}
.topo{position:sticky;top:0;z-index:5;background:rgba(10,10,12,.92);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top,0)}
.topoIn{display:flex;align-items:center;gap:16px;min-height:60px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.marca{display:flex;align-items:center;gap:8px;color:var(--hd);font-weight:700;text-decoration:none;font-size:17px}
.marca img{border-radius:7px}
.menu{display:flex;gap:4px 18px;flex-wrap:wrap;flex:1;justify-content:center}
.menu a{color:var(--mut);text-decoration:none;font-size:14px;padding:6px 0}
.menu a:hover,.menu a[aria-current=page]{color:var(--hd)}
.btn{display:inline-block;border-radius:12px;padding:11px 18px;font-weight:600;text-decoration:none;font-size:15px;text-align:center;border:1px solid transparent}
.btnP{background:var(--ac);color:#04130a}
.btnS{background:var(--card);color:var(--hd);border-color:var(--line)}
.topoBtn{padding:8px 14px;font-size:14px}
@media (max-width:720px){.menu{order:3;flex-basis:100%;justify-content:flex-start;gap:4px 14px}.topoBtn{margin-left:auto}}
.hero{padding:56px 0 24px;background:radial-gradient(700px 300px at 15% 0%,rgba(34,197,94,.14),transparent 70%),radial-gradient(600px 300px at 90% 10%,rgba(139,92,246,.12),transparent 70%)}
.selo{display:inline-block;font-size:13px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:3px 12px;margin:0 0 14px}
h1{color:var(--hd);font-size:clamp(30px,6vw,52px);line-height:1.1;letter-spacing:-.02em;margin:0 0 14px}
h2{color:var(--hd);font-size:clamp(22px,3.4vw,30px);line-height:1.2;letter-spacing:-.01em;margin:0 0 18px}
h3{color:var(--hd);font-size:17px;margin:0 0 6px}
.lead{font-size:clamp(17px,2.2vw,20px);color:var(--txt);max-width:62ch;margin:0 0 20px}
.ctas{display:flex;gap:10px;flex-wrap:wrap}
.mini,.nota{font-size:13px;color:var(--mut)}
.cab{padding:48px 20px 8px}
.bloco{padding-top:36px;padding-bottom:20px}
.grade3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px}
.item{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
.item p{margin:0;color:var(--mut);font-size:15px}
.tag{font-size:12px;font-weight:700;vertical-align:middle;border:1px solid var(--line);border-radius:999px;padding:2px 10px;color:var(--mut);text-transform:uppercase;letter-spacing:.03em}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}
.shot{margin:0;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:10px}
.shot img{display:block;width:100%;border-radius:14px;aspect-ratio:402/800;object-fit:cover;object-position:top}
.shot figcaption{font-size:13px;color:var(--mut);padding:8px 4px 2px}
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px}
.plano{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
.plano.destaque{border-color:var(--ac)}
.preco{font-size:32px;font-weight:700;color:var(--hd);margin:4px 0;font-variant-numeric:tabular-nums}
.preco small{font-size:14px;font-weight:400;color:var(--mut);margin-left:4px}
.pAnual{margin:0 0 6px;font-size:13px;color:var(--mut)}
.checks{list-style:none;padding:0;margin:12px 0 0}
.checks li{position:relative;padding-left:24px;margin:7px 0;font-size:15px}
.checks li:before{content:"";position:absolute;left:3px;top:6px;width:10px;height:6px;border-left:2px solid var(--ac);border-bottom:2px solid var(--ac);transform:rotate(-45deg)}
.aviso{background:var(--card2);border:1px solid var(--line);border-left:3px solid var(--ac2);border-radius:12px;padding:14px 16px;margin:16px 0 0;font-size:15px}
.tabelaW{overflow-x:auto;border:1px solid var(--line);border-radius:14px}
.tabela{width:100%;border-collapse:collapse;font-size:14px;min-width:0}
.tabela th,.tabela td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.tabela thead th{color:var(--hd);background:var(--card)}
.tabela thead small{display:block;font-weight:400;color:var(--mut);font-size:12px}
.tabela td{text-align:center;white-space:nowrap}
.tabela tbody th{font-weight:400}
.sim{color:var(--ac);font-weight:600}.nao{color:var(--mut)}
@media (max-width:520px){.tabela{font-size:13px}.tabela th,.tabela td{padding:8px 6px}.tabela thead small{font-size:11px}.tabela td{white-space:normal}}
.lista{padding-left:20px}.lista li{margin:6px 0}
.texto{max-width:760px}
.legal h2{font-size:20px;margin-top:28px}
.faq{max-width:780px}
.faqI{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 16px;margin:0 0 10px}
.faqI summary{cursor:pointer;font-weight:600;color:var(--hd);padding:12px 0;list-style-position:outside}
.faqI p{margin:0 0 14px;color:var(--txt)}
.final{text-align:center;padding-bottom:48px}
.rodape{border-top:1px solid var(--line);margin-top:40px;padding:28px 0 calc(28px + env(safe-area-inset-bottom,0))}
.rodIn{display:flex;gap:20px;justify-content:space-between;flex-wrap:wrap}
.rodIn p{color:var(--mut);font-size:14px;margin:6px 0 0}
.rodIn nav{display:flex;flex-wrap:wrap;gap:6px 18px;max-width:560px}
.rodIn nav a{color:var(--mut);font-size:14px;text-decoration:none}
.rodIn nav a:hover{color:var(--hd)}
a:focus-visible,summary:focus-visible{outline:2px solid var(--ac);outline-offset:2px;border-radius:4px}
'''

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    arqs = {'index.html': landing(), 'funcionalidades.html': funcionalidades(), 'precos.html': precos(), 'sobre.html': sobre(), 'faq.html': faq(), 'privacidade.html': privacidade(), 'termos.html': termos(), 'site.css': CSS}
    # v10.103: index.html, funcionalidades.html e site.css passaram a ser editados à mão (redesenho de nov/2026); não sobrescrever
    for n in ('index.html', 'funcionalidades.html', 'site.css'): arqs.pop(n)
    for n, t in arqs.items():
        open(os.path.join(OUT, n), 'w', encoding='utf-8').write(t)
    print('site/ gerado:', ', '.join(arqs))
