# site.py (v10.82; revisado em 10/11/2026 para o app v10.156): gera as páginas públicas em site/ (estáticas, pt-BR) a partir de planos.js (fonte única dos planos).
# Gera TODAS as páginas .html (inclusive index e funcionalidades, que voltaram a ser geradas aqui). site/site.css é editado à mão e não é sobrescrito.
# uso: python3 site.py          (rodar de novo sempre que planos.js ou estes textos mudarem)
# O app continua em ./ (start_url do app instalado). As páginas ficam em ./site/ e não usam JavaScript.
import json, os, subprocess, html, datetime
RAIZ = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RAIZ, 'site')
P = json.loads(subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1])))', os.path.join(RAIZ, 'planos.js')]))
PL, REC, LIM = P['PLANOS'], P['RECURSOS'], P['LIMITES']
EMAIL = 'matheuswillian982018@gmail.com'
VIGENCIA = '1º de novembro de 2026'
VIGENCIA_TERMOS = '3 de novembro de 2026'
# identificação do fornecedor (Decreto 7.962/2013). Preencha e rode site.py; vazio = a linha não aparece.
FORNECEDOR_CPF = '063.907.503-74'        # ex.: '000.000.000-00' (o Matheus preenche direto no GitHub; não passa pelo chat)
FORNECEDOR_ENDERECO = 'RUA 12 CHACARA 312A LOTE 10 LOJA 03 SETOR HABITACIONAL VICENTE PIRES 72007-730'   # endereço físico completo, com CEP  # v10.110: arrependimento, reembolso e identificação
e = html.escape

def brl(v):
    s = f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return 'R$ ' + (s[:-3] if s.endswith(',00') else s)

APP = '../'   # o app (start_url do PWA)
NAV = [('funcionalidades.html', 'Funcionalidades'), ('precos.html', 'Planos e preços'), ('sobre.html', 'Sobre'), ('faq.html', 'Dúvidas')]

def pagina(arq, titulo, descricao, corpo, atual=None, cabeca=''):
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
{cabeca}<link rel="stylesheet" href="site.css">
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo"><div class="lim topoIn">
  <a class="marca" href="./"><img src="../icons/icon-192.png" alt="" width="28" height="28">GranaViva</a>
  <nav class="menu" aria-label="Páginas">{nav}</nav>
  <a class="btn btnP topoBtn" href="{APP}">Abrir o app</a>
</div></header>
<main id="conteudo">
{corpo}
</main>
<footer class="rodape"><div class="lim rodIn">
  <div><a class="marca" href="./"><img src="../icons/icon-192.png" alt="" width="24" height="24">GranaViva</a><p>Controle financeiro pessoal, feito no Brasil.</p><p class="forn">Mantido por Matheus Willian, desenvolvedor independente em Brasília (DF). Atendimento: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></div>
  <nav aria-label="Rodapé"><a href="funcionalidades.html">Funcionalidades</a><a href="precos.html">Planos e preços</a><a href="sobre.html">Sobre</a><a href="faq.html">Dúvidas</a><a href="privacidade.html">Política de privacidade</a><a href="termos.html">Termos de uso</a><a href="mailto:{EMAIL}">Contato</a></nav>
</div></footer>
</body>
</html>
'''

# ---------- conteúdo compartilhado ----------
L_IA1, L_IA2, L_AS2 = LIM[1]['leitura_ia_dia'], LIM[2]['leitura_ia_dia'], LIM[2]['assistente_dia']
NV = lambda k: REC[k]['nivel']          # nível mínimo de cada recurso, de planos.js
NOME_NV = [PL['gratis']['nome'], PL['plus']['nome'], PL['pro']['nome']]
# Radar de preços (app.js: RD_MAX=30 ativos, RD_AL=3 alertas por ativo; faz parte do recurso "investimentos")
RADAR_MAX, RADAR_AL = 30, 3

def card_plano(id, destaque=False):
    p = PL[id]
    itens = {
        'gratis': ['Lançamentos de receitas, despesas e transferências', 'Contas fixas e recorrências', 'Contas e bancos, com saldo de cada uma', 'Cartões, faturas e parcelas', 'Início com o resumo do mês e assinaturas detectadas', 'Alertas de vencimento no celular', 'PIN e Face ID, exportar e excluir seus dados'],
        'plus': ['Tudo do Grátis', 'Planejamento e projeção de saldo', 'Orçamentos por categoria e plano pela renda', 'Metas com ritmo e rendimento pelo CDI', 'Relatórios completos e resumo do mês', 'Importar extrato (PDF, OFX ou CSV) e anexar comprovantes', f'Lançar com IA por foto ou frase ({L_IA1} por dia)'],
        'pro': ['Tudo do Plus', 'Investimentos: FIIs, ações, BDRs, ETFs, cripto e renda fixa pelo CDI', f'Radar de preços: até {RADAR_MAX} ativos, com alertas no celular', 'Patrimônio líquido mês a mês', f'Assistente com IA ({L_AS2} perguntas por dia)', f'Lançar com IA ({L_IA2} por dia)'],
    }[id]
    preco = 'R$ 0' if id == 'gratis' else brl(p['preco'])
    sufixo = 'para sempre' if id == 'gratis' else '/mês'
    extra = f'<p class="pAnual">ou {brl(PL["pro_anual"]["preco"])}/ano no Pro anual</p>' if id == 'pro' else ''
    etq = ' <span class="etq">mais completo</span>' if destaque else ''
    li = ''.join(f'<li>{e(x)}</li>' for x in itens)
    return f'''<article class="plano{' destaque' if destaque else ''}">
  <h3>{e(p['nome'])}{etq}</h3>
  <p class="preco">{preco}<small>{sufixo}</small></p>{extra}
  <ul class="checks">{li}</ul>
</article>'''

def grade_planos():
    return f'<div class="planos">{card_plano("gratis")}{card_plano("plus")}{card_plano("pro", True)}</div>'

# formas de pagamento: o app cria uma assinatura (preapproval) no Mercado Pago sem meio definido; quem escolhe o meio é a tela do MP.
PAG_MEIOS = 'Você escolhe a forma de pagamento na tela do Mercado Pago, entre as que ele oferece para assinaturas (cartão de crédito ou saldo da conta Mercado Pago, por exemplo).'
NOTA_PAG = f'<p class="aviso"><strong>Como assinar.</strong> No app, em Ajustes, escolha o plano e pague pelo Mercado Pago. Toda conta nova ganha {P["TESTE_DIAS"]} dias do Pro para testar, sem cartão. Depois, ela continua no Grátis e nada do que você registrou é apagado.</p>'

def fone(img, alt, lazy=True):
    a = f' alt="{e(alt)}"' if alt else ' alt=""'
    return f'<div class="fone"><img src="img/{img}.webp"{a} width="540" height="1168"{" loading=\"lazy\"" if lazy else ""}></div>'

# ---------- páginas ----------
def landing():
    ld = json.dumps({"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "GranaViva", "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web, Android, iOS (PWA)", "inLanguage": "pt-BR", "url": "https://theuuswillian.github.io/grana-viva/site/",
        "image": "https://theuuswillian.github.io/grana-viva/site/img/og.jpg",
        "description": "Controle financeiro pessoal: lançamentos, cartões e faturas, orçamentos, planejamento, metas, investimentos com Radar de preços e IA.",
        "offers": [{"@type": "Offer", "name": PL[k]['nome'], "price": f'{PL[k]["preco"]:.2f}', "priceCurrency": "BRL"} for k in ('gratis', 'plus', 'pro', 'pro_anual')],
        "author": {"@type": "Person", "name": "Matheus Willian"}}, ensure_ascii=False)
    cabeca = f'''<link rel="canonical" href="https://theuuswillian.github.io/grana-viva/site/">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="GranaViva">
<meta property="og:title" content="GranaViva · seu dinheiro organizado, sem planilha">
<meta property="og:description" content="Gastos, cartões, orçamento pela renda, metas e investimentos em um só app brasileiro. Comece grátis.">
<meta property="og:url" content="https://theuuswillian.github.io/grana-viva/site/">
<meta property="og:image" content="https://theuuswillian.github.io/grana-viva/site/img/og.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="image" href="img/inicio.webp" type="image/webp">
<script type="application/ld+json">{ld}</script>
'''
    faq_curto = ''.join(f'<details class="faqI"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in FAQ if q in FAQ_HOME)
    corpo = f'''
<section class="hero2"><div class="lim">
  <div>
    <p class="selo2 sobe"><i></i>Feito no Brasil, em português</p>
    <h1 class="sobe d1">Saiba quanto vai <em>sobrar</em> antes do mês acabar.</h1>
    <p class="lead sobe d2">Gastos, cartões e faturas, orçamento pela sua renda, metas e investimentos no mesmo app. Lance um gasto pela foto do comprovante ou por uma frase, digitada ou falada, e veja o saldo previsto de cada dia até o fim do mês.</p>
    <div class="ctas sobe d3"><a class="btn btnP" href="{APP}">Começar grátis</a><a class="btn btnS" href="precos.html">Ver planos</a></div>
    <ul class="provas sobe d3"><li>{P["TESTE_DIAS"]} dias do Pro, sem cartão</li><li>Sem anúncios</li><li>Celular e computador</li></ul>
  </div>
  <div class="palco" aria-hidden="true">
    <div class="fone tras esq"><img src="img/cartoes.webp" alt="" width="540" height="1168"></div>
    <div class="fone flutua"><img src="img/inicio.webp" alt="" width="540" height="1168" fetchpriority="high"></div>
    <div class="fone tras dir"><img src="img/radar.webp" alt="" width="540" height="1168" loading="lazy"></div>
    <div class="chip c1">Melhor cartão hoje<b>o que dá mais prazo</b></div>
    <div class="chip c2">Previsão do fim do mês<b class="lm">R$ 6.664,60</b>dados de exemplo</div>
  </div>
</div></section>

<section class="faixa" aria-label="Destaques"><div class="lim"><ul>
  <li><b>R$ 0</b>cartões e faturas no Grátis</li>
  <li><b>50/30/20</b>orçamento pela sua renda</li>
  <li><b>Radar de preços</b>alertas de preço no celular</li>
  <li><b>Foto ou frase</b>vira lançamento com IA</li>
</ul></div></section>

<section class="lim sec" aria-labelledby="t-como">
  <p class="kick">Como funciona</p>
  <h2 id="t-como">Organizado em três passos.</h2>
  <ol class="passos">
    <li><b>Crie sua conta</b><span>Com e-mail ou Google, em menos de um minuto. Você ganha {P["TESTE_DIAS"]} dias do Pro, sem cartão.</span></li>
    <li><b>Traga o seu mês</b><span>Cadastre contas e cartões, marque as contas fixas e lance os gastos à mão, por foto, por frase ou importando o extrato.</span></li>
    <li><b>Acompanhe sem susto</b><span>Veja o saldo previsto, o limite de cada categoria e receba avisos de fatura, contas do dia e orçamento no celular.</span></li>
  </ol>
</section>

<section class="lim sec" id="por-que">
  <p class="kick">Por que GranaViva</p>
  <h2>O que costuma estar espalhado em vários apps, num só lugar.</h2>
  <div class="difs">
    <article class="dif revela"><div class="ic">1</div><h3>Cartões e faturas de graça, para sempre</h3><p>Compras e parcelas na fatura certa, fechamento, vencimento, limite usado e juros de atraso, tudo no plano Grátis.</p><p class="porque">Por que importa: em vários apps conhecidos não há plano grátis permanente, ou cadastrar todos os cartões só é possível no plano pago.</p></article>
    <article class="dif revela"><div class="ic">2</div><h3>Gastos e investimentos juntos</h3><p>FIIs, ações, BDRs, ETFs, cripto e renda fixa (CDB, LCI/LCA, Tesouro, caixinhas) com proventos, preço médio, IR e rendimento pelo CDI em dias úteis.</p><p class="porque">Por que importa: o patrimônio fecha com as suas contas e faturas, sem um segundo app só para a carteira.</p></article>
    <article class="dif revela"><div class="ic">3</div><h3>Radar de preços</h3><p>Siga até {RADAR_MAX} ativos que você ainda não tem, defina até {RADAR_AL} alertas por ativo (acima de, abaixo de ou queda no dia) e receba o aviso no celular, mesmo com o app fechado.</p><p class="porque">Por que importa: você não precisa ficar olhando cotação o dia todo.</p></article>
    <article class="dif revela"><div class="ic">4</div><h3>Orçamento que nasce da sua renda</h3><p>Diga quanto ganha e escolha um perfil: Equilibrado 50/30/20, Contas apertadas 60/30/10 ou Acelerar 50/20/30. O app sugere o limite de cada categoria e mostra se você está no ritmo.</p><p class="porque">Por que importa: você não começa de uma tela vazia.</p></article>
    <article class="dif revela"><div class="ic">5</div><h3>IA incluída no plano</h3><p>A foto do comprovante ou uma frase ("gastei 32 no mercado ontem"), digitada ou falada, vira um lançamento para você conferir antes de salvar. No Plus, {L_IA1} leituras por dia.</p><p class="porque">Por que importa: a IA não é um adicional cobrado à parte.</p></article>
    <article class="dif revela"><div class="ic">6</div><h3>Saldo de cada dia e o melhor cartão</h3><p>Calendário com o saldo dia a dia, aviso quando o saldo vai ficar negativo e qual cartão dá mais prazo para pagar uma compra feita hoje.</p><p class="porque">Por que importa: você decide antes de gastar, não depois da fatura.</p></article>
  </div>
</section>

<section class="lim sec" aria-labelledby="t-telas">
  <p class="kick">Por dentro</p>
  <h2 id="t-telas">Telas reais da versão atual.</h2>
  <p class="sub">Capturas do app com dados de exemplo (nenhum dado de cliente).</p>

  <div class="vit revela">
    <div class="vitTxt"><h3>Orçamentos com ritmo</h3><p>Veja se o gasto do mês está no ritmo, quanto ainda resta em cada categoria e um limite sugerido para o que ainda não tem limite (média dos últimos 3 meses).</p><ul class="lst"><li>Plano pela renda 50/30/20, 60/30/10 ou 50/20/30</li><li>Histórico de planejado x gasto</li><li>Aviso em 80% e 100% do limite</li></ul></div>
    <div class="vitImgs">{fone("orc", "Tela de Orçamentos: gasto do mês, status no ritmo e quanto resta")}{fone("plan", "Planejamento: saldo de hoje, projeção e calendário do saldo dia a dia")}</div>
  </div>

  <div class="vit inv revela">
    <div class="vitTxt"><h3>Cartões que pensam no vencimento</h3><p>O cartão aparece com a cara do seu banco. Fatura aberta, fechada ou vencida, limite disponível, faturas por mês e a agenda de fechamento e vencimento.</p><ul class="lst"><li>"Melhor cartão para comprar hoje"</li><li>Parcelas no ciclo certo</li><li>Pagar a fatura direto da conta</li></ul></div>
    <div class="vitImgs">{fone("cartoes", "Cartões: cartão do banco, fatura atual, fechamento e vencimento")}{fone("metas", "Metas: ritmo de economia, guardado e alvo")}</div>
  </div>

  <div class="vit revela">
    <div class="vitTxt"><h3>Lance em segundos</h3><p>Tire foto do comprovante ou diga o gasto do seu jeito: valor, onde, quando e como pagou. A IA preenche o lançamento e você confere antes de salvar.</p><ul class="lst"><li>Fale segurando o microfone ou use o ditado do teclado</li><li>Importe o extrato em PDF, OFX ou CSV, sem duplicar</li><li>Plus: {L_IA1} leituras por dia · Pro: {L_IA2}</li></ul></div>
    <div class="vitImgs">{fone("ia-frase", "Falar ou escrever: a frase vira um lançamento preenchido pela IA")}</div>
  </div>

  <div class="vit inv revela">
    <div class="vitTxt"><h3>Investimentos, Radar e patrimônio</h3><p>Carteira com cotação da B3 (atraso de cerca de 15 minutos) e próximo provento com valor esperado. No Radar, siga ativos que você ainda não tem e receba alertas de preço no celular.</p><ul class="lst"><li>Ações, FIIs e BDRs conferidos a cada 15 min no pregão; cripto de hora em hora</li><li>Renda fixa com taxas oficiais do Banco Central, IR regressivo e IOF</li><li>Patrimônio líquido mês a mês</li></ul></div>
    <div class="vitImgs">{fone("radar", "Radar de preços: ativos seguidos, preço, variação de 30 dias e quanto falta para o alvo")}{fone("radar-alertas", "Alertas do Radar: acima de, abaixo de ou queda no dia, até 3 por ativo")}</div>
  </div>

  <div class="vit revela">
    <div class="vitTxt"><h3>No computador, uma tela de verdade</h3><p>Em telas largas o app usa colunas e barra lateral. É o mesmo app e a mesma conta do celular, sincronizados.</p><ul class="lst"><li>Instala na tela inicial (PWA) e abre sem internet com a última cópia</li><li>Temas escuro, preto OLED e claro</li></ul></div>
    <div class="pc"><div class="barra"><i></i><i></i><i></i></div><img src="img/inicio-pc.webp" alt="GranaViva no computador: saldo total, entradas e saídas, previsão do fim do mês" width="1600" height="800" loading="lazy"></div>
  </div>
</section>

<section class="lim sec" aria-labelledby="t-comp">
  <p class="kick">Comparação</p>
  <h2 id="t-comp">Onde cada um fica.</h2>
  <p class="sub">Preços e recursos segundo o site de cada concorrente em 03/11/2026. Valores mudam com promoções; confira sempre na página oficial. Onde não encontramos a informação, deixamos "—".</p>
  <div class="comp"><table>
    <thead><tr><th scope="col">&nbsp;</th><th scope="col" class="gv">GranaViva</th><th scope="col">App A <small>gastos</small></th><th scope="col">App B <small>gastos</small></th><th scope="col">App C <small>gastos</small></th><th scope="col">App D <small>investimentos</small></th></tr></thead>
    <tbody>
      <tr><th scope="row">Foco</th><td class="gv">Gastos, cartões, planejamento e investimentos</td><td>Gastos e cartões</td><td>Gastos e cartões</td><td>Gastos e orçamento</td><td>Só investimentos</td></tr>
      <tr><th scope="row">Plano grátis permanente</th><td class="gv">Sim, com cartões e faturas</td><td>Sim, com limites</td><td>Não, só teste grátis</td><td>Sim, manual</td><td>Sim, com limite de ativos</td></tr>
      <tr><th scope="row">Plano pago</th><td class="gv">Plus {brl(PL["plus"]["preco"])}/mês · Pro {brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano</td><td>Anual, na faixa de R$ 100</td><td>Na faixa de R$ 30 a R$ 40 por mês</td><td>Mensal, entre R$ 20 e R$ 30</td><td>Só via assinatura de outra empresa</td></tr>
      <tr><th scope="row">Conexão automática com o banco (Open Finance)</th><td class="gv">Experimental <small>via Meu Pluggy, para quem já usa; ou importe o extrato em PDF, OFX ou CSV</small></td><td>Sim, no plano pago</td><td>Sim, num plano mais caro</td><td>Sim, no plano pago</td><td>Para investimentos</td></tr>
      <tr><th scope="row">IA para lançar gastos</th><td class="gv">Foto ou frase (digitada ou falada), no Plus</td><td>Assistente no plano mais caro</td><td>Adicional pago à parte</td><td>—</td><td>—</td></tr>
      <tr><th scope="row">Investimentos com proventos e alertas de preço</th><td class="gv">Sim, no Pro</td><td>—</td><td>—</td><td>—</td><td>Sim, no plano pago</td></tr>
      <tr><th scope="row">Anúncios</th><td class="gv">Não</td><td>—</td><td>—</td><td>Contém anúncios</td><td>—</td></tr>
    </tbody>
  </table></div>
  <p class="fontes">Apps A a D: aplicativos brasileiros de finanças pessoais conhecidos, com nomes omitidos. Dados tirados dos sites públicos de cada um em 03/11/2026; preços e recursos podem mudar.</p>
</section>

<section class="lim sec" aria-labelledby="t-seg">
  <p class="kick">Segurança e privacidade</p>
  <h2 id="t-seg">O que protegemos, e o que sai do app.</h2>
  <div class="seg">
    <div class="item"><h3>Só você vê</h3><p>Cada conta acessa apenas os próprios dados, por regras de segurança no banco de dados. A conexão é sempre criptografada (HTTPS).</p></div>
    <div class="item"><h3>Criptografado no aparelho</h3><p>A cópia offline fica cifrada com AES-256, com uma chave que o navegador não deixa copiar.</p></div>
    <div class="item"><h3>PIN e Face ID</h3><p>Trave o app neste aparelho e desbloqueie com biometria nos aparelhos compatíveis.</p></div>
    <div class="item"><h3>Leve ou apague</h3><p>Exporte tudo (JSON e planilha) ou exclua a conta e os dados em Ajustes, quando quiser.</p></div>
  </div>
  <div class="franco">
    <h3>Para ser transparente</h3>
    <ul class="lista">
      <li>Os dados ficam no Supabase, com servidores nos Estados Unidos.</li>
      <li>Quando você usa a IA, a foto ou a frase vai para o Gemini, do Google. Hoje usamos o nível gratuito, cujos termos permitem que o Google use esse conteúdo para melhorar os produtos dele. Se preferir, não use a IA com documentos sensíveis: o resto do app funciona sem ela.</li>
      <li>O pagamento é feito no Mercado Pago. Os dados do seu cartão não chegam ao GranaViva.</li>
      <li>Não vendemos dados, não mostramos anúncios e não usamos rastreadores de publicidade.</li>
    </ul>
  </div>
  <p><a href="privacidade.html">Leia a Política de privacidade</a></p>
</section>

<section class="lim sec" aria-labelledby="t-planos">
  <p class="kick">Planos</p>
  <h2 id="t-planos">Comece grátis. Assine só se precisar.</h2>
  {grade_planos()}
  {NOTA_PAG}
  <p><a href="precos.html">Comparar todos os recursos</a></p>
</section>

<section class="lim sec" aria-labelledby="t-faq">
  <p class="kick">Dúvidas</p>
  <h2 id="t-faq">Antes de começar.</h2>
  <div class="faq">{faq_curto}</div>
  <p><a href="faq.html">Ver todas as dúvidas</a></p>
</section>

<section class="lim"><div class="cta2 revela">
  <h2>Seu próximo mês já começa organizado.</h2>
  <p>Crie sua conta com e-mail ou Google e use o Pro por {P["TESTE_DIAS"]} dias, sem cartão.</p>
  <a class="btn btnP" href="{APP}">Começar grátis</a>
</div></section>'''
    return pagina('index.html', 'GranaViva · controle financeiro com cartões, investimentos e IA',
        'App brasileiro de finanças pessoais: gastos, cartões e faturas no plano grátis; orçamento pela renda (50/30/20), metas, investimentos com Radar de preços e lançamento por foto ou frase com IA. Sem anúncios.',
        corpo, cabeca=cabeca)

def funcionalidades():
    def g(nivel, titulo, itens):
        li = ''.join(f'<div class="item"><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in itens)
        return f'<section class="lim bloco"><h2>{titulo} <span class="tag">{e(NOME_NV[nivel])}</span></h2><div class="grade3">{li}</div></section>'
    corpo = '<section class="lim cab"><h1>Funcionalidades</h1><p class="lead">Tudo o que o GranaViva faz hoje, separado pelo plano em que aparece. Toda conta nova usa o Pro por ' + str(P['TESTE_DIAS']) + ' dias.</p></section>'
    corpo += g(0, 'Controle do dia a dia', [
        ('Lançamentos', 'Receitas, despesas e transferências, com status pago, previsto ou cancelado. Só o que está pago entra no saldo.'),
        ('Dividir entre categorias', 'Um gasto pode ser dividido em até 10 partes, em categorias diferentes, com os centavos sempre exatos.'),
        ('Contas fixas e recorrências', 'Diária, semanal, quinzenal, mensal, anual ou a cada N dias, com primeira cobrança e data de fim.'),
        ('Contas e bancos', 'Saldo de cada conta, transferências entre elas e contas arquivadas que continuam no histórico.'),
        ('Cartões e faturas', 'Cartão com a cara do seu banco, compras e parcelas na fatura certa, fechamento e vencimento, limite usado, juros de atraso e o melhor cartão para comprar hoje.'),
        ('Categorias, subcategorias e tags', 'Organize do seu jeito e filtre a lista por tag, texto ou período.'),
        ('Assinaturas detectadas', 'O Início mostra as cobranças que se repetem todo mês e avisa quando uma delas fica mais cara.'),
        ('Empréstimos a receber', 'Registre dinheiro que você emprestou, acompanhe o que falta receber e lembre a pessoa com uma mensagem pronta no WhatsApp.'),
        ('Alertas no celular', 'Faturas a vencer ou atrasadas, contas fixas, lançamentos previstos e resumo diário ou semanal. No Android e no computador pelo navegador; no iPhone, com o app instalado na Tela de Início.'),
        ('Temas', 'Escuro, preto OLED e claro, e um layout em colunas no computador.'),
        ('Instale como app', 'Funciona no navegador e pode ser instalado na tela inicial; abre mesmo sem internet com a última cópia.'),
        ('PIN e Face ID', 'Trave o app com PIN e, nos aparelhos compatíveis, desbloqueie com biometria.'),
        ('Exportar e excluir', 'Baixe todos os seus dados (JSON e planilha) ou exclua a conta inteira em Ajustes.'),
    ])
    corpo += g(1, 'Planejar e enxergar o mês', [
        ('Orçamentos', 'Status no ritmo, acima do ritmo ou estourado, quanto resta por categoria, limite sugerido para gastos sem limite e histórico de planejado x gasto, com aviso em 80% e 100%.'),
        ('Plano pela renda', 'Informe a renda e escolha Equilibrado 50/30/20, Contas apertadas 60/30/10 ou Acelerar 50/20/30: o app sugere os limites e você aplica com um toque.'),
        ('Metas', 'Seu ritmo de economia (média dos últimos 3 meses), quanto guardar por mês, previsão de chegada, metas que rendem pelo CDI, alvo pela Tabela FIPE para carro ou moto e lembrete do dia de guardar.'),
        ('Planejamento', 'Projeção de 3, 6 e 12 meses, simulação de renda extra ou cortes e saldo dia a dia.'),
        ('Relatórios', 'Comparação com o mês anterior, ritmo de gastos, variação por categoria e resumo do mês.'),
        ('Importar extrato', 'PDF do extrato ou da fatura (lido com IA), OFX ou CSV do banco, com sugestão de categoria e sem duplicar lançamentos.'),
        ('Comprovantes', 'Anexe fotos e PDFs aos lançamentos, guardados em um espaço privado da sua conta.'),
        ('Lançar com IA', f'A foto do comprovante ou uma frase, digitada ou falada ("gastei 32 no mercado ontem"), vira um lançamento para você conferir. Até {L_IA1} por dia no Plus e {L_IA2} no Pro.'),
    ])
    corpo += g(2, 'Investimentos e patrimônio', [
        ('Carteira completa', 'FIIs, ações, BDRs, ETFs e cripto, com cotação da B3 (atraso de cerca de 15 minutos) e de cripto, proventos com valor esperado, reinvestimento e preço médio.'),
        ('Radar de preços', f'Siga até {RADAR_MAX} ativos que você ainda não tem, com preço, variação de 30 dias e quanto falta para o alvo. Até {RADAR_AL} alertas por ativo (acima de, abaixo de ou queda no dia), com aviso no celular mesmo com o app fechado. Comprou? Leve para a carteira com um toque.'),
        ('Renda fixa pelo CDI', 'CDB, LCI/LCA, Tesouro, caixinhas e poupança calculados com as taxas oficiais do Banco Central, dias úteis e IR.'),
        ('Imposto das vendas', 'Estimativa do DARF das vendas de ações e FIIs, com aviso 7 dias antes e no dia do vencimento. Confira sempre o valor com a Receita Federal.'),
        ('Patrimônio', 'Contas, investimentos e bens menos dívidas e faturas, com histórico mês a mês.'),
        ('Assistente com IA', f'Pergunte "quanto gastei com mercado em outubro?". O app calcula com os seus dados e a resposta é conferida. Até {L_AS2} perguntas por dia. Não é recomendação de investimento.'),
    ])
    corpo += '''<section class="lim bloco"><h2>Experimental e em preparação</h2><div class="grade3">
<div class="item"><h3>Conexão bancária (Meu Pluggy)</h3><p>Para quem já usa o Meu Pluggy: o app traz contas e transações pelo Open Finance e você revisa tudo antes de entrar. Exige criar a sua conta no Meu Pluggy e copiar as credenciais de lá, por isso é um recurso avançado e experimental, disponível em todos os planos enquanto estiver em teste.</p></div>
<div class="item"><h3>Lançar pelo WhatsApp</h3><p>Mandar "gastei 32 no almoço" para o WhatsApp do GranaViva e o lançamento entrar no app. Ainda não está disponível: o número oficial está em preparação.</p></div>
</div></section>'''
    corpo += f'<section class="lim bloco final"><div class="ctas cen"><a class="btn btnP" href="{APP}">Começar grátis</a><a class="btn btnS" href="precos.html">Ver planos e preços</a></div></section>'
    return pagina('funcionalidades.html', 'Funcionalidades · GranaViva', 'Lançamentos, cartões e faturas, orçamentos, planejamento, metas, investimentos com Radar de preços e IA no GranaViva.', corpo, 'funcionalidades.html')

# rótulos da tabela de preços: os nomes vêm de planos.js; aqui só o texto mostrado no site, quando o app faz mais do que o nome diz
ROTULO = {'importar_extrato': 'Importar extrato (PDF, OFX ou CSV)', 'investimentos': 'Investimentos (FIIs, ações, ETFs, BDRs, cripto, renda fixa e cotações)'}
def precos():
    linhas = ''
    def linha(nome, nivel):
        cel = ''.join(f'<td>{"<span class=sim>Sim</span>" if nivel <= n else "<span class=nao>Não</span>"}</td>' for n in (0, 1, 2))
        return f'<tr><th scope="row">{e(nome)}</th>{cel}</tr>'
    for k, r in REC.items():
        linhas += linha(ROTULO.get(k, r['nome']), r['nivel'])
        if k == 'investimentos':
            linhas += linha(f'Radar de preços com alertas no celular (até {RADAR_MAX} ativos)', r['nivel'])
    linhas += '<tr><th scope="row">Leituras com IA por dia</th>' + ''.join(f'<td>{LIM[n]["leitura_ia_dia"] or "Não"}</td>' for n in (0, 1, 2)) + '</tr>'
    linhas += '<tr><th scope="row">Perguntas ao assistente por dia</th>' + ''.join(f'<td>{LIM[n]["assistente_dia"] or "Não"}</td>' for n in (0, 1, 2)) + '</tr>'
    linhas += '<tr><th scope="row">Conexão bancária pelo Meu Pluggy (experimental)</th>' + '<td><span class=sim>Sim</span></td>' * 3 + '</tr>'
    corpo = f'''<section class="lim cab"><h1>Planos e preços</h1><p class="lead">Comece grátis. Assine só se precisar de mais.</p><div class="ctas"><a class="btn btnP" href="{APP}">Começar grátis</a></div></section>
<section class="lim bloco">{grade_planos()}{NOTA_PAG}</section>
<section class="lim bloco"><h2>Compare os recursos</h2>
<div class="tabelaW"><table class="tabela"><thead><tr><th scope="col">Recurso</th><th scope="col">{e(PL["gratis"]["nome"])}<small>R$ 0</small></th><th scope="col">{e(PL["plus"]["nome"])}<small>{brl(PL["plus"]["preco"])}/mês</small></th><th scope="col">{e(PL["pro"]["nome"])}<small>{brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano</small></th></tr></thead><tbody>{linhas}</tbody></table></div>
</section>
<section class="lim bloco"><h2>Como funciona a cobrança</h2>
<ul class="lista">
<li>Assinatura mensal ({PL["plus"]["nome"]} ou {PL["pro"]["nome"]}) ou anual ({PL["pro_anual"]["nome"]}), cobrada de forma recorrente pelo Mercado Pago. {PAG_MEIOS}</li>
<li>O GranaViva não recebe nem guarda os dados do seu cartão.</li>
<li>Cancele quando quiser em Ajustes. O acesso continua até o fim do período já pago.</li>
<li>Se desistir em até 7 dias da contratação, devolvemos todo o valor pago. Hoje o pedido é feito por e-mail; veja como nos <a href="termos.html">Termos de uso</a>.</li>
<li>Ao voltar para o Grátis, nada é apagado: os recursos pagos ficam escondidos e voltam se você assinar de novo.</li>
</ul>
<p>Mais detalhes nos <a href="termos.html">Termos de uso</a>.</p></section>'''
    return pagina('precos.html', 'Planos e preços · GranaViva', f'Grátis, Plus por {brl(PL["plus"]["preco"])}/mês e Pro por {brl(PL["pro"]["preco"])}/mês ou {brl(PL["pro_anual"]["preco"])}/ano.', corpo, 'precos.html')

def sobre():
    corpo = f'''<section class="lim cab"><h1>Sobre</h1><p class="lead">O GranaViva nasceu de uma necessidade simples: saber para onde o dinheiro vai e quanto vai sobrar, sem planilha.</p></section>
<section class="lim bloco texto">
<p>O GranaViva é um app de controle financeiro pessoal feito no Brasil, em português, pensado para o jeito brasileiro de lidar com dinheiro: Pix, cartão com fatura e parcelas, contas fixas, caixinhas que rendem pelo CDI, fundos imobiliários e ações da B3.</p>
<p>É desenvolvido de forma independente por Matheus Willian, em Brasília (DF). Não há investidores nem anúncios: o projeto se sustenta pelas assinaturas dos planos pagos.</p>
<h2>No que acreditamos</h2>
<ul class="lista">
<li><strong>Seus dados são seus.</strong> Você pode exportar tudo ou excluir sua conta a qualquer momento.</li>
<li><strong>Números certos.</strong> As contas são feitas em centavos, sem arredondamentos escondidos, e o que é estimativa aparece como estimativa.</li>
<li><strong>IA com responsabilidade.</strong> A IA ajuda a lançar e a responder perguntas, mas você confere cada lançamento antes de salvar e ela não mexe em nada sozinha.</li>
<li><strong>Honestidade sobre o que existe.</strong> O site mostra o que o app faz hoje. O que está em teste ou em preparação aparece marcado assim.</li>
<li><strong>Simples por padrão.</strong> O básico é grátis e continua grátis.</li>
</ul>
<h2>Fale com a gente</h2>
<p>Dúvidas, sugestões ou pedidos sobre seus dados: <a href="mailto:{EMAIL}">{EMAIL}</a>. Respondemos em até 5 dias úteis.</p>
<p><a class="btn btnP" href="{APP}">Começar grátis</a></p>
</section>'''
    return pagina('sobre.html', 'Sobre · GranaViva', 'Quem faz o GranaViva e no que acreditamos.', corpo, 'sobre.html')

Q_TESTE = f'O que acontece depois dos {P["TESTE_DIAS"]} dias de teste?'
FAQ = [
    ('O GranaViva é grátis?', 'Sim. O plano Grátis não tem prazo e inclui lançamentos, contas fixas, contas, categorias, cartões e faturas, o resumo do mês e alertas. Os planos Plus e Pro liberam planejamento, orçamentos, relatórios, metas, investimentos, o Radar de preços e a IA.'),
    (Q_TESTE, 'Sua conta passa para o Grátis automaticamente. Nada é cobrado, porque o teste não pede cartão, e nada do que você registrou é apagado. Os recursos pagos ficam escondidos e voltam se você assinar.'),
    ('Como assino e quais formas de pagamento são aceitas?', 'No app, abra Ajustes, escolha o plano e pague pelo Mercado Pago. ' + PAG_MEIOS + ' A renovação é automática até você cancelar.'),
    ('Como cancelo a assinatura?', 'Em Ajustes, no app. O acesso continua até o fim do período já pago e você não é cobrado de novo.'),
    ('Posso desistir e receber o dinheiro de volta?', 'Sim, em até 7 dias da contratação, com devolução de todo o valor. Hoje o pedido é feito por e-mail (' + EMAIL + '), com o e-mail da sua conta. Só cancelar em Ajustes interrompe as próximas cobranças, mas não pede o reembolso. Os detalhes estão nos Termos de uso.'),
    ('O que é o Radar de preços?', f'Um recurso do Pro, na aba Investimentos. Você segue até {RADAR_MAX} ações, FIIs, ETFs, BDRs ou criptomoedas, mesmo sem tê-los, e cria até {RADAR_AL} alertas por ativo: acima de um preço, abaixo de um preço ou queda forte no dia. O aviso chega no celular mesmo com o app fechado. A B3 é conferida a cada 15 minutos no pregão (cotação com até 15 minutos de atraso) e cripto, de hora em hora. Não é recomendação de compra ou venda.'),
    ('Dá para lançar falando?', 'Sim, nos planos com IA. Em "Falar ou escrever", segure o microfone e diga o gasto, ou use o ditado do teclado do celular. A fala vira texto pelo reconhecimento de voz do próprio navegador ou do teclado (da Apple ou do Google, conforme o aparelho) e só a frase escrita vai para a IA montar o lançamento, que você confere antes de salvar. Áudios pelo WhatsApp ainda não estão disponíveis.'),
    ('Conecta com o meu banco?', 'Você pode importar o extrato em PDF, OFX ou CSV (Plus e Pro). Existe também uma conexão bancária experimental pelo Meu Pluggy, para quem já tem conta lá: é preciso criar a conta no Meu Pluggy e copiar as credenciais para o app. Ainda não há uma conexão Open Finance simples, de um toque.'),
    ('Dá para lançar pelo WhatsApp?', 'Ainda não. O recurso está em preparação e aparece no app como "em breve".'),
    ('Meus dados estão seguros?', 'Os dados ficam em um banco de dados na nuvem (Supabase, com servidores nos Estados Unidos) com regras que deixam cada conta ver apenas os próprios dados, conexão sempre criptografada (HTTPS) e uma cópia criptografada no seu aparelho. Nenhum sistema é 100% imune a falhas, mas tratamos segurança como prioridade.'),
    ('Vocês vendem meus dados ou mostram anúncios?', 'Não. Não vendemos nem alugamos dados e não há anúncios.'),
    ('A IA lê meus dados?', 'Só quando você usa um recurso de IA. Na leitura de comprovante ou de frase, a foto, o PDF ou o texto vai para a IA do Google (Gemini) para montar o lançamento. No assistente, vão a pergunta e os totais calculados pelo app, não a lista dos seus lançamentos. Hoje usamos o nível gratuito do Gemini, em que o Google pode usar esse conteúdo para melhorar os produtos dele. Veja os detalhes na Política de privacidade.'),
    ('Funciona sem internet?', 'O app abre com a última cópia salva no aparelho e guarda o que você lançar para enviar quando a conexão voltar.'),
    ('Como instalo no celular?', 'No iPhone, abra o app no Safari, toque em Compartilhar e em "Adicionar à Tela de Início". No Android, abra no Chrome e toque em "Instalar app" ou "Adicionar à tela inicial". No iPhone, as notificações só funcionam com o app instalado.'),
    ('Como exporto ou excluo meus dados?', 'Em Ajustes, em "Privacidade e seus dados": exportar baixa tudo em JSON e planilha; excluir apaga a conta, os lançamentos e os comprovantes de forma definitiva.'),
    ('O GranaViva dá recomendação de investimento?', 'Não. Os números de investimentos e os alertas do Radar são cálculos e avisos para você acompanhar sua carteira. Não são recomendação de compra ou venda.'),
]
FAQ_HOME = (Q_TESTE, 'Como assino e quais formas de pagamento são aceitas?', 'Dá para lançar falando?', 'Conecta com o meu banco?')
def faq():
    itens = ''.join(f'<details class="faqI"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in FAQ)
    corpo = f'''<section class="lim cab"><h1>Dúvidas frequentes</h1></section>
<section class="lim bloco faq">{itens}</section>
<section class="lim bloco"><p>Não achou sua resposta? Escreva para <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></section>'''
    return pagina('faq.html', 'Dúvidas frequentes · GranaViva', 'Respostas sobre planos, teste grátis, pagamento, Radar de preços, segurança, IA, instalação e seus dados no GranaViva.', corpo, 'faq.html')

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
<li><strong>Radar de preços:</strong> os ativos que você acompanha, os alertas de preço que você cria e o registro dos alertas já enviados, para não avisar duas vezes.</li>
<li><strong>Conexão bancária (opcional e experimental, pelo Meu Pluggy):</strong> se você ativar, as credenciais de acesso à Pluggy (guardadas criptografadas) e as contas e transações que a Pluggy enviar.</li>
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
<li><strong>Google</strong>: o login com Google, se você escolher; e a IA <strong>Gemini</strong>, quando você usa a leitura de comprovante, o lançamento por frase ou o assistente. Na leitura, vai a foto, o PDF ou o texto que você enviou; no assistente, vai a pergunta e os totais calculados pelo app. Hoje usamos o nível gratuito da API do Gemini, cujos termos permitem que o Google use esse conteúdo para melhorar seus produtos. Por isso, evite enviar documentos com dados que você não quer compartilhar e não use os recursos de IA se não concordar. Se você usar o microfone no lançamento por frase, a fala é transformada em texto pelo reconhecimento de voz do navegador ou do sistema do aparelho (da Apple ou do Google, conforme o aparelho), segundo as regras desses fornecedores; o GranaViva recebe apenas o texto.</li>
<li><strong>Pluggy</strong>, somente se você ativar a conexão bancária.</li>
<li><strong>Mercado Pago</strong>, para processar as assinaturas pagas. O Mercado Pago trata os dados de pagamento conforme a política de privacidade dele.</li>
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
    corpo = f'''<section class="lim cab"><h1>Termos de uso</h1><p class="lead">Regras para usar o GranaViva. Vigentes a partir de {VIGENCIA_TERMOS}.</p></section>
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
<li>As assinaturas são cobradas de forma recorrente (mensal ou anual) pelo Mercado Pago, que processa o pagamento. Você escolhe a forma de pagamento na tela do Mercado Pago, entre as que ele oferece para assinaturas. O GranaViva não recebe os dados do seu cartão.</li>
<li>Você pode cancelar a qualquer momento em Ajustes. O cancelamento interrompe as próximas cobranças e o acesso pago continua até o fim do período já pago.</li>
<li>Você pode desistir de uma assinatura em até 7 dias da contratação e receber todo o valor pago de volta. Veja a seção 5.</li>
<li>Se um pagamento não for aprovado, a conta volta ao Grátis depois de um curto período de tolerância.</li>
<li>Mudanças de preço serão avisadas com pelo menos 30 dias de antecedência e valem a partir da cobrança seguinte.</li>
<li>Ao passar para um plano menor, nenhum dado é apagado: os recursos do plano anterior ficam indisponíveis até você assinar de novo.</li>
<li>Contas criadas antes do lançamento dos planos ("contas fundadoras") mantêm acesso completo sem cobrança.</li>
</ul>

<h2>5. Direito de arrependimento e reembolso</h2>
<ul class="lista">
<li><strong>Arrependimento em 7 dias.</strong> Como a contratação é feita pela internet, você pode desistir de qualquer assinatura paga em até 7 dias corridos, contados da data da contratação, sem precisar dar motivo (Código de Defesa do Consumidor, art. 49). Devolvemos <strong>todo o valor pago</strong>, sem descontos, e a conta volta ao plano Grátis (ou ao teste, se ele ainda estiver valendo).</li>
<li><strong>Como pedir.</strong> Escreva para <a href="mailto:{EMAIL}">{EMAIL}</a> com o e-mail da sua conta e diga que quer desistir. Confirmamos o recebimento do pedido assim que o lermos. Cancelar a assinatura em Ajustes interrompe as próximas cobranças, mas, sozinho, não pede o reembolso: para receber o valor de volta dentro dos 7 dias, envie o e-mail.</li>
<li><strong>Como o dinheiro volta.</strong> O estorno é feito pelo Mercado Pago no mesmo meio de pagamento usado: no cartão de crédito, aparece na fatura atual ou na seguinte, conforme o banco emissor; no saldo da conta Mercado Pago ou em outro meio (como Pix), volta para a conta de origem. Pedimos o estorno em até 5 dias úteis depois de receber o seu pedido.</li>
<li><strong>Depois dos 7 dias.</strong> Você pode cancelar quando quiser, sem multa. As próximas cobranças param e o acesso pago continua até o fim do período já pago, sem devolução proporcional desse período, inclusive no plano anual. Renovações automáticas não reabrem o prazo de 7 dias.</li>
<li><strong>Cobrança indevida.</strong> Se houver cobrança em duplicidade, cobrança depois do cancelamento ou falha nossa que impeça o uso do plano pago, devolvemos o valor cobrado indevidamente, a qualquer tempo, sem prejuízo dos seus outros direitos como consumidor.</li>
</ul>

<h2>6. Cálculos, cotações e IA</h2>
<ul class="lista">
<li>Saldos, projeções, rendimentos, impostos estimados e cotações são cálculos feitos a partir do que você registra e de fontes públicas, que podem ter atraso (as cotações da B3 têm cerca de 15 minutos de atraso). Confira valores importantes na fonte oficial (seu banco, corretora ou a Receita Federal).</li>
<li>Os recursos de IA podem errar. A leitura de comprovante sempre abre o lançamento para você conferir antes de salvar, e o assistente não altera nada no app.</li>
<li>Nada no GranaViva é oferta, recomendação ou consultoria de investimento.</li>
</ul>

<h2>7. Uso permitido</h2>
<p>Não é permitido: tentar acessar dados de outras pessoas; contornar limites, planos ou travas de segurança; sobrecarregar ou atacar o serviço; usar o app para atividade ilegal; ou copiar e revender o serviço. Podemos suspender contas que descumpram estas regras.</p>

<h2>8. Disponibilidade</h2>
<p>Trabalhamos para manter o GranaViva disponível e seus dados seguros, mas o serviço depende de internet e de fornecedores (como Supabase, Google e Mercado Pago) e pode ter interrupções. Recomendamos exportar seus dados de tempos em tempos.</p>

<h2>9. Responsabilidade</h2>
<p>Respeitados os direitos que a lei garante ao consumidor, o GranaViva não se responsabiliza por decisões financeiras tomadas com base nas informações do app nem por dados registrados de forma incorreta pelo usuário.</p>

<h2>10. Encerramento</h2>
<p>Você pode excluir sua conta a qualquer momento em Ajustes. Se o GranaViva deixar de existir, avisaremos com antecedência para que você possa exportar seus dados.</p>

<h2>11. Mudanças nestes Termos</h2>
<p>Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no app antes de valer.</p>

<h2>12. Lei e foro</h2>
<p>Estes Termos seguem a lei brasileira, incluindo o Código de Defesa do Consumidor. Fica eleito o foro do domicílio do consumidor.</p>

<h2>13. Quem fornece o serviço e contato</h2>
<p>O GranaViva é fornecido por Matheus Willian, desenvolvedor independente, em Brasília (DF){(", CPF nº " + e(FORNECEDOR_CPF)) if FORNECEDOR_CPF else ""}{(", com endereço em " + e(FORNECEDOR_ENDERECO)) if FORNECEDOR_ENDERECO else ""}. Atendimento, pedidos de arrependimento, reembolso e reclamações: <a href="mailto:{EMAIL}">{EMAIL}</a>. Respondemos em até 5 dias úteis.</p>
</section>'''
    return pagina('termos.html', 'Termos de uso · GranaViva', 'Regras de uso do GranaViva: conta, planos, pagamento, cancelamento, IA e responsabilidades.', corpo)

# site.css é mantido à mão desde o redesenho de nov/2026 (v10.103) e não é gerado aqui.

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    arqs = {'index.html': landing(), 'funcionalidades.html': funcionalidades(), 'precos.html': precos(), 'sobre.html': sobre(), 'faq.html': faq(), 'privacidade.html': privacidade(), 'termos.html': termos()}
    # 10/11/2026: index.html e funcionalidades.html voltaram a ser gerados (preços e limites saem de planos.js); site.css continua à mão
    for n, t in arqs.items():
        open(os.path.join(OUT, n), 'w', encoding='utf-8').write(t)
    print('site/ gerado:', ', '.join(arqs))
