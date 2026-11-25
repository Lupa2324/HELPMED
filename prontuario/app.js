(function () {
  const KB = window.KB;
  const q = document.getElementById("q");
  const chipsEl = document.getElementById("chips");
  const resultsEl = document.getElementById("results");
  const countEl = document.getElementById("count");
  const detailEl = document.getElementById("detail");
  const draftEl = document.getElementById("draft");
  const toast = document.getElementById("toast");
  const ctxUbs = document.getElementById("ctx-ubs");
  const ctxPs = document.getElementById("ctx-ps");

  const CHIPS = [
    "Febre", "Tosse", "Dor de garganta", "Coriza", "Dispneia", "Chiado",
    "Diarreia", "Vômito", "Azia", "Dor abdominal", "Disúria", "Olho vermelho",
    "Dor muscular", "Dor intensa", "Constipação", "Celulite", "Cefaleia", "Sinusite"
  ];

  let contexto = "ubs";
  let selected = null;
  let chipOn = new Set();
  let ranked = [];

  function norm(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function tokens(s) {
    return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  }

  const EXAME = [
    "Bom estado geral, corado, hidratado, lúcido e orientado.",
    "ACV: RCR, sem B3 ou B4, BNF, sem SA",
    "AR: MV+ em AHT, sem RA",
    "ABD: Semigloboso, flácido, RHA+, indolor à palpação superficial ou profunda, DB (-), Murphy (-), Giordano (-),",
    "NEU: Glasgow 15, PIFR, força muscular grau V, sem sinais de irritação meníngea, nistagmo ou ataxia",
    "EXT: Aquecidas, sem edemas, com pulsos periféricos cheios e simétricos, tempo de reenchimento capilar < 2 seg."
  ].join("\n");

  function fonteLabel(c) {
    if (c.fonte === "cola") return "Cola Prof. Leo";
    if (c.fonte === "vermelha") return "Prescrevendo Vermelha";
    return c.fonte;
  }

  function fonteClass(c) {
    return c.fonte === "vermelha" ? "tag verm" : "tag";
  }

  function remumeHits(farmaco) {
    const n = norm(farmaco);
    const keys = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 5);
    if (!keys.length) return [];
    const primary = keys[0];
    return KB.remume.filter((m) => norm(m.principio).includes(primary)).slice(0, 3);
  }

  function scoreCond(c, query) {
    const qn = norm(query).trim();
    if (!qn) return c.fonte === "cola" ? 1 : 0;
    const bag = norm([c.nome, c.sistema, ...(c.sintomas || []), c.quadro].join(" "));
    let score = 0;
    if (bag.includes(qn)) score += 8;
    const ts = tokens(qn);
    const symptomBag = norm((c.sintomas || []).join(" ") + " " + c.nome);
    ts.forEach((t) => {
      if (symptomBag.includes(t)) score += 3;
      else if (bag.includes(t)) score += 1;
    });
    if (c.fonte === "cola" && score) score += 2;
    return score;
  }

  function search(query) {
    return KB.condicoes
      .map((c) => ({ c, score: scoreCond(c, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.nome.localeCompare(b.c.nome, "pt"));
  }

  function queryFromUi() {
    const typed = q.value.trim();
    const extra = [...chipOn].join(" ");
    return [typed, extra].filter(Boolean).join(" ");
  }

  function renderResults() {
    const query = queryFromUi();
    ranked = search(query);
    const show = query
      ? ranked.slice(0, 30)
      : KB.condicoes.filter((c) => c.fonte === "cola").map((c) => ({ c, score: 1 }));
    countEl.textContent = query
      ? show.length + " hipótese(s)" + (ranked.length > show.length ? " · 30 melhores" : "")
      : "Combos da cola. Digite um sintoma para incluir a Vermelha.";
    resultsEl.innerHTML = "";
    show.forEach(({ c }) => {
      const cond = c;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result" + (selected && selected.id === cond.id ? " on" : "");
      const page = cond.pagina ? " · p. " + cond.pagina : "";
      btn.innerHTML = "<strong>" + escapeHtml(cond.nome) + "</strong><small>" +
        escapeHtml(fonteLabel(cond) + " · " + (cond.sistema || "") + page) + "</small>";
      btn.addEventListener("click", () => select(cond));
      resultsEl.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function rxLines(c) {
    return c.prescricoes.map((p, i) => {
      const head = (i + 1) + ". " + p.farmaco + (p.quantidade ? " — " + p.quantidade : "");
      const body = p.posologia || "conferir fonte";
      const obs = p.obs ? "\n   " + p.obs : "";
      return head + "\n   " + body + obs;
    }).join("\n");
  }

  function buildDraft(c) {
    const queixa = queryFromUi() || c.nome;
    const exames = (c.exames && c.exames.length) ? c.exames.join("\n") : "Não constam exames nesta fonte.";
    const fecha = contexto === "ubs"
      ? [
          "Prescrição de medicações/solicitação de exames e encaminhamentos conforme registro em sistema.",
          "Paciente ciente e concordante.",
          "Oriento sinais de alarme e retorno se necessário.",
          "Indico prática de atividade física e adequação alimentar."
        ]
      : [
          "Prescrição de medicações/solicitação de exames conforme registro em sistema.",
          "Paciente ciente e concordante.",
          "Oriento sinais de alarme e retorno se necessário."
        ];
    const linhas = [
      "ANAMNESE",
      "Paciente refere: " + queixa + ".",
      "Nega febre, alterações gastrointestinais, sangramentos, alergias, comorbidades e MUC, salvo o descrito acima.",
      "",
      "EXAME FÍSICO",
      EXAME,
      "",
      "HIPÓTESE",
      c.nome + " (" + fonteLabel(c) + (c.pagina ? ", p. " + c.pagina : "") + ").",
      "",
      "QUADRO (fonte: " + fonteLabel(c) + ")",
      c.quadro,
      "",
      "CONDUTA (fonte: " + fonteLabel(c) + ")",
      c.conduta,
      "",
      "EXAMES",
      exames,
      "",
      "PRESCRIÇÃO (fonte: " + fonteLabel(c) + ")",
      rxLines(c),
      "",
      ...fecha,
      "",
      "Apoio à redação. Conferir dose, alergias, gestação, função renal e REMUME local."
    ];
    return linhas.join("\n");
  }

  function select(c) {
    selected = c;
    renderResults();
    const bits = [];
    bits.push('<span class="' + fonteClass(c) + '">' + escapeHtml(fonteLabel(c)) + "</span>");
    if (c.fonte === "cola") bits.push('<span class="tag prompt">Modelo de evolução: Prompts</span>');
    bits.push("<h2>" + escapeHtml(c.nome) + "</h2>");
    if (c.pagina) bits.push('<p class="page-ref">Prescrevendo Vermelha, página ' + c.pagina + ".</p>");
    bits.push("<h3>Quadro</h3><p class=\"block\">" + escapeHtml(c.quadro) + "</p>");
    bits.push("<h3>Conduta</h3><p class=\"block\">" + escapeHtml(c.conduta) + "</p>");
    bits.push("<h3>Exames</h3><p class=\"block\">" + escapeHtml((c.exames && c.exames.length) ? c.exames.join("\n") : "Não constam nesta fonte.") + "</p>");
    bits.push("<h3>Prescrição</h3>");
    c.prescricoes.forEach((p) => {
      const hits = remumeHits(p.farmaco);
      const rem = hits.length
        ? '<p class="remume">REMUME Pedreira: ' + hits.map((h) => escapeHtml(h.principio + " — " + h.forma + " (" + h.financiamento + ")")).join("; ") + ".</p>"
        : '<p class="remume">REMUME Pedreira: sem apresentação correspondente na lista extraída.</p>';
      const pos = p.posologia || "conferir fonte";
      bits.push(
        '<div class="rx"><b>' + escapeHtml(p.farmaco) + (p.quantidade ? " — " + escapeHtml(p.quantidade) : "") + "</b>" +
        "<p>" + escapeHtml(pos) + "</p>" +
        (p.obs ? '<p class="warnline">' + escapeHtml(p.obs) + "</p>" : "") +
        rem + "</div>"
      );
    });
    if (c.fonte === "cola") {
      bits.push('<h3>Aviso da cola</h3><p class="block">' + escapeHtml(KB.aviso_leo) + "</p>");
    }
    detailEl.innerHTML = bits.join("");
    draftEl.value = buildDraft(c);
    detailEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast.textContent = label + ".";
    } catch (e) {
      draftEl.focus();
      toast.textContent = "Não foi possível usar a área de transferência. O texto está no rascunho para selecionar.";
    }
  }

  document.getElementById("copy-evo").addEventListener("click", () => {
    copyText(draftEl.value, "Evolução copiada");
  });
  document.getElementById("copy-rx").addEventListener("click", () => {
    if (!selected) { toast.textContent = "Selecione uma hipótese."; return; }
    copyText(rxLines(selected), "Prescrição copiada");
  });
  document.getElementById("copy-cond").addEventListener("click", () => {
    if (!selected) { toast.textContent = "Selecione uma hipótese."; return; }
    copyText(selected.conduta, "Conduta copiada");
  });

  function setCtx(which) {
    contexto = which;
    ctxUbs.classList.toggle("on", which === "ubs");
    ctxPs.classList.toggle("on", which === "ps");
    ctxUbs.setAttribute("aria-pressed", which === "ubs");
    ctxPs.setAttribute("aria-pressed", which === "ps");
    if (selected) draftEl.value = buildDraft(selected);
  }
  ctxUbs.addEventListener("click", () => setCtx("ubs"));
  ctxPs.addEventListener("click", () => setCtx("ps"));

  CHIPS.forEach((label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.addEventListener("click", () => {
      if (chipOn.has(label)) chipOn.delete(label); else chipOn.add(label);
      b.classList.toggle("on", chipOn.has(label));
      renderResults();
    });
    chipsEl.appendChild(b);
  });

  q.addEventListener("input", renderResults);
  renderResults();
})();
