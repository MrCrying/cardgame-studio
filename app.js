(function () {
  const catalog = window.CARD_CATALOG;
  if (!catalog || !Array.isArray(catalog.cards)) {
    document.body.insertAdjacentHTML(
      "beforeend",
      "<p class='panel'>找不到 cards.js，請先執行 python -m scripts.export_web_catalog</p>"
    );
    return;
  }

  const CARDS = catalog.cards;
  const byName = Object.fromEntries(CARDS.map((c) => [c.name, c]));
  const SHARE_NAMES = catalog.shareNames || CARDS.map((c) => c.name).sort();
  const SHARE_FP = catalog.shareFingerprint || 0;
  const SHARE_MAJOR = catalog.gameVersionMajor ?? 0;
  const SHARE_MINOR = catalog.gameVersionMinor ?? 0;
  const SHARE_API = String(catalog.shareApiUrl || "http://127.0.0.1:8765").replace(/\/$/, "");
  const SHARE_SECRET = String(catalog.shareApiSecret || "");
  const SHARE_API_LOCAL = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  const EFFECT_TEMPLATES = catalog.effectTemplates || [];
  const DRAFT_KEY = "cardgame-studio-drafts";
  const DECK_KEY = "cardgame-web-deck";
  const COL_LABELS = ["一位", "二位", "三位"];

  const emptyDeck = () => ({
    board: ["", "", "", "", "", ""],
    hand: ["", "", ""],
    hero: "",
    field: "",
  });

  let deck = loadDeck();
  let selectedSlot = "b0";
  let drafts = loadDrafts();

  function $(id) {
    return document.getElementById(id);
  }

  function loadDeck() {
    try {
      const raw = JSON.parse(localStorage.getItem(DECK_KEY) || "null");
      if (raw && Array.isArray(raw.board)) return { ...emptyDeck(), ...raw };
    } catch (_e) {}
    return emptyDeck();
  }

  function saveDeck() {
    localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  }

  function loadDrafts() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_e) {
      return [];
    }
  }

  function saveDrafts() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  }

  function setTab(tab) {
    document.querySelectorAll(".tabs button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    ["catalog", "units", "bosses", "glossary", "deck", "studio"].forEach((name) => {
      $("panel-" + name).classList.toggle("hidden", name !== tab);
    });
  }

  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (btn) setTab(btn.dataset.tab);
  });

  function fillKindSelect(el, exclude) {
    const skip = exclude || [];
    el.innerHTML =
      '<option value="all">類型：全部</option>' +
      catalog.kinds
        .filter((k) => skip.indexOf(k.id) < 0)
        .map((k) => `<option value="${k.id}">${k.zh}</option>`)
        .join("");
  }

  fillKindSelect($("cat-kind"), ["boss"]);
  fillKindSelect($("unit-kind"), ["field", "boss"]);
  fillKindSelect($("deck-kind"), ["boss"]);
  const SEASON_OPTIONS = [
    [1, "第一賽季（術法起源）"],
    [2, "第二賽季（火力主義）"],
    [3, "第三賽季"],
    [4, "第四賽季（末法時代）"],
    [5, "第五賽季"],
  ];
  const seasonSelects = [$("cat-season"), $("deck-season")];
  seasonSelects.forEach((sel) => {
    SEASON_OPTIONS.forEach(([id, label]) => {
      sel.insertAdjacentHTML("beforeend", `<option value="${id}">${label}</option>`);
    });
  });

  function catalogKindOf(c) {
    if (c.catalogKind) return c.catalogKind;
    if (c.trainingOnly || c.kind === "boss" || c.rarity === "boss" || c.bossOnly) return "boss";
    if (c.kind === "spell" || c.kind === "field") return c.kind;
    return "unit";
  }

  function cardMatches(c, q, kind, rarity, season) {
    if (kind !== "all" && catalogKindOf(c) !== kind) return false;
    if (rarity !== "all" && c.rarity !== rarity) return false;
    if (season !== "all" && String(c.season) !== season) return false;
    if (!q) return true;
    const hay = [
      c.name,
      c.kindZh,
      c.rarityZh,
      c.seasonZh,
      c.detail,
      ...(c.effects || []).map((x) => x.name + x.text),
      ...(c.skills || []).map((x) => x.name + x.text),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function rarityClass(c) {
    if (c.rarity === "legend") return "legend";
    if (c.rarity === "epic") return "epic";
    if (c.rarity === "hero") return "hero";
    if (c.rarity === "boss") return "boss";
    return "";
  }

  function rarityTextClass(c) {
    if (c.rarity === "legend") return "rarity-legend";
    if (c.rarity === "epic") return "rarity-epic";
    if (c.rarity === "hero") return "rarity-hero";
    if (c.rarity === "boss") return "rarity-boss";
    return "rarity-common";
  }

  function atkIcons(map) {
    const icons = { melee: "⚔", ranged: "🏹", undead: "💀" };
    const parts = ["melee", "ranged", "undead"]
      .filter((k) => Number((map || {})[k] || 0) > 0)
      .map((k) => (icons[k] || "") + map[k]);
    return parts.join(" ") || "0";
  }

  function spellAttackLine(c) {
    const icons = { melee: "⚔", ranged: "🏹", undead: "💀" };
    if (Number(c.attack || 0) > 0) {
      return (icons[c.damageAttackType] || "") + c.attack;
    }
    if (c.applyPoisonUntilDeath && Number(c.poisonDamage || 0) > 0) {
      return (icons[c.poisonAttackType] || "") + c.poisonDamage;
    }
    return "";
  }

  function statChip(label, value) {
    if (value === "" || value == null) return "";
    return `<span class="stat"><span>${escapeHtml(label)}</span>${escapeHtml(String(value))}</span>`;
  }

  function renderCardBody(c) {
    const chips = [];
    if (c.kind === "spell") {
      const atk = spellAttackLine(c);
      if (atk) chips.push(statChip("傷害", atk));
      if (Number(c.endOfTurnHeal || 0) > 0) chips.push(statChip("治療", c.endOfTurnHeal));
      if (c.summonTempShield) chips.push(statChip("護盾", c.defense ?? 10));
    } else {
      chips.push(statChip("攻擊", atkIcons(c.attackValues)));
      chips.push(statChip("護盾", c.defense));
      chips.push(statChip("生命", c.hp));
      chips.push(statChip("攻擊次數", c.attackCount));
      if (c.usesCooldown && Number(c.cooldownMax || 0) > 0) {
        chips.push(statChip("攻擊冷卻", c.cooldownMax));
      }
      if (Number(c.endOfTurnHeal || 0) > 0) chips.push(statChip("治療", c.endOfTurnHeal));
      if (Number(c.executeThreshold || 0) > 0) chips.push(statChip("斬殺", c.executeThreshold));
    }
    const stats = chips.filter(Boolean).length
      ? `<div class="stats">${chips.filter(Boolean).join("")}</div>`
      : "";
    const skills = (c.skills || []).filter((e) => e && (e.name || e.text));
    const effects = (c.effects || []).filter((e) => e && (e.name || e.text));
    const skillHtml = skills.length
      ? `<ul class="effect-list">${skills
          .map(
            (e) =>
              `<li><b>${escapeHtml(e.name || "")}</b>${escapeHtml(e.text || "")}</li>`
          )
          .join("")}</ul>`
      : "";
    const effectHtml = effects.filter((e) => e.name).length
      ? `<div class="effect-names">${effects
          .filter((e) => e.name)
          .map((e) => `<span>${escapeHtml(e.name)}</span>`)
          .join("")}</div>`
      : "";
    return stats + skillHtml + effectHtml;
  }

  function isBossCard(c) {
    return c.trainingOnly || c.kind === "boss" || c.rarity === "boss" || c.bossOnly;
  }

  function cardArticle(c) {
    const rc = rarityClass(c);
    const rarityPill =
      c.rarityZh && c.rarityZh !== "—"
        ? `<span class="pill ${rc}">${escapeHtml(c.rarityZh)}</span>`
        : "";
    const seasonPill =
      c.seasonZh && c.seasonZh !== "—"
        ? `<span class="pill">${escapeHtml(c.seasonZh)}</span>`
        : "";
    const note = unitNote(c);
    const notePill = note ? `<span class="pill">${escapeHtml(note)}</span>` : "";
    return `<article class="card">
      <h3 class="${rarityTextClass(c)}">${escapeHtml(c.name)}</h3>
      <div class="pills">
        <span class="pill">${escapeHtml(c.kindZh)}</span>
        ${rarityPill}
        ${seasonPill}
        ${notePill}
      </div>
      ${renderCardBody(c)}
    </article>`;
  }

  const CATALOG_CARDS = CARDS.filter((c) => !isBossCard(c));
  const BOSS_CARDS = CARDS.filter((c) => isBossCard(c));
  const TABLE_KIND_IDS = new Set((catalog.unitKinds || []).map((k) => k.id).concat(["unit", "spell"]));
  const TABLE_CARDS = CARDS.filter((c) => TABLE_KIND_IDS.has(catalogKindOf(c)));
  const RARITY_ORDER = (catalog.rarities || []).map((r) => r.id);
  const KIND_ORDER = (catalog.unitKinds || []).map((k) => k.id);

  function renderCatalog() {
    const q = $("cat-q").value.trim().toLowerCase();
    const kind = $("cat-kind").value;
    const rarity = $("cat-rarity").value;
    const season = $("cat-season").value;
    const list = CATALOG_CARDS.filter((c) => cardMatches(c, q, kind, rarity, season));
    $("cat-count").textContent = `顯示 ${list.length} / ${CATALOG_CARDS.length}`;
    $("catalog-grid").innerHTML = list.map(cardArticle).join("");
  }

  function unitNote(c) {
    const notes = [];
    if (c.trainingOnly) notes.push("訓練場");
    if (c.adminOnly) notes.push("管理員");
    if (c.bossOnly) notes.push("首領專用");
    return notes.join("／");
  }

  function tableAttack(c) {
    if (catalogKindOf(c) !== "spell") return c.attackValues || {};
    const av = { melee: 0, ranged: 0, undead: 0 };
    const dmg = Number(c.attack || 0);
    if (dmg > 0) av[c.damageAttackType || "ranged"] = dmg;
    else if (c.applyPoisonUntilDeath && Number(c.poisonDamage || 0) > 0) {
      av[c.poisonAttackType || "ranged"] = Number(c.poisonDamage);
    }
    return av;
  }

  function renderUnitTables() {
    const q = ($("unit-q").value || "").trim().toLowerCase();
    const kind = $("unit-kind").value;
    const rarity = $("unit-rarity").value;
    const list = TABLE_CARDS.filter((c) => cardMatches(c, q, kind, rarity, "all"));
    $("unit-count").textContent = `顯示 ${list.length} / ${TABLE_CARDS.length}`;
    const rarityOrder = RARITY_ORDER.length ? RARITY_ORDER : ["common", "epic", "legend", "hero", "boss"];
    const kindRank = {};
    (KIND_ORDER.length ? KIND_ORDER : ["unit", "spell"]).forEach((kid, i) => {
      kindRank[kid] = i;
    });
    const groups = [];
    rarityOrder.forEach((rid) => {
      const rows = list
        .filter((c) => (c.rarity || "") === rid)
        .sort((a, b) => {
          const ka = kindRank[catalogKindOf(a)] ?? 99;
          const kb = kindRank[catalogKindOf(b)] ?? 99;
          if (ka !== kb) return ka - kb;
          return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
        });
      if (rows.length) groups.push({ rarity: rid, rows });
    });
    const leftover = list.filter((c) => !groups.some((g) => g.rows.includes(c)));
    if (leftover.length) groups.push({ rarity: "", rows: leftover });
    $("unit-tables").innerHTML = groups
      .map((g) => {
        const unitN = g.rows.filter((c) => catalogKindOf(c) === "unit").length;
        const spellN = g.rows.filter((c) => catalogKindOf(c) === "spell").length;
        const rarityZh = g.rows[0] ? g.rows[0].rarityZh || "其他" : "其他";
        const title = `${escapeHtml(rarityZh)}（單位 ${unitN}／法術 ${spellN}）`;
        const body = g.rows
          .map((c) => {
            const av = tableAttack(c);
            const fx = []
              .concat((c.skills || []).map((e) => e.name), (c.effects || []).map((e) => e.name))
              .filter(Boolean)
              .join("、");
            const note = unitNote(c);
            return `<tr>
              <td class="name ${rarityTextClass(c)}">${escapeHtml(c.name)}</td>
              <td>${escapeHtml(c.kindZh || "")}</td>
              <td>${escapeHtml(c.rarityZh || "—")}</td>
              <td>${escapeHtml(c.seasonZh || "—")}</td>
              <td>${escapeHtml(String(av.melee || 0))}</td>
              <td>${escapeHtml(String(av.ranged || 0))}</td>
              <td>${escapeHtml(String(av.undead || 0))}</td>
              <td>${escapeHtml(String(c.defense ?? 0))}</td>
              <td>${escapeHtml(String(c.hp ?? 0))}</td>
              <td>${escapeHtml(String(c.attackCount ?? 0))}</td>
              <td class="text">${escapeHtml(fx)}</td>
              <td class="text">${escapeHtml(note)}</td>
            </tr>`;
          })
          .join("");
        return `<section class="unit-block">
          <h3>${title}</h3>
          <table class="glossary unit-table">
            <thead><tr>
              <th>名稱</th><th>種類</th><th>稀有度</th><th>賽季</th>
              <th>近戰</th><th>遠程</th><th>亡靈</th>
              <th>護盾</th><th>生命</th><th>次數</th><th>效果</th><th>備註</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </section>`;
      })
      .join("");
  }

  function renderBosses() {
    const q = $("boss-q").value.trim().toLowerCase();
    const list = BOSS_CARDS.filter((c) => cardMatches(c, q, "all", "all", "all"));
    $("boss-count").textContent = `顯示 ${list.length} / ${BOSS_CARDS.length}`;
    $("boss-grid").innerHTML = list.map(cardArticle).join("");
  }

  function renderGlossary() {
    const q = ($("gloss-q").value || "").trim().toLowerCase();
    const entries = catalog.effectGlossary || [];
    const list = entries.filter((e) => {
      if (!q) return true;
      return [e.group, e.name, e.text].join(" ").toLowerCase().includes(q);
    });
    $("gloss-count").textContent = `顯示 ${list.length} / ${entries.length}`;
    $("glossary-table").innerHTML =
      "<thead><tr><th>效果</th><th>說明</th></tr></thead><tbody>" +
      list
        .map(
          (e) =>
            `<tr><td class="name">${escapeHtml(e.name)}</td><td class="text">${escapeHtml(e.text)}</td></tr>`
        )
        .join("") +
      "</tbody>";
  }

  ["cat-q", "cat-kind", "cat-rarity", "cat-season"].forEach((id) => {
    $(id).addEventListener("input", renderCatalog);
    $(id).addEventListener("change", renderCatalog);
  });
  ["unit-q", "unit-kind", "unit-rarity"].forEach((id) => {
    $(id).addEventListener("input", renderUnitTables);
    $(id).addEventListener("change", renderUnitTables);
  });
  $("boss-q").addEventListener("input", renderBosses);
  $("gloss-q").addEventListener("input", renderGlossary);

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slotAllowed(card, slot) {
    if (!card) return false;
    if (slot === "hero") return (card.slots || []).includes("hero");
    if (slot === "field") return (card.slots || []).includes("field");
    if (slot.startsWith("h")) return (card.slots || []).includes("hand");
    const idx = Number(slot.slice(1));
    const row = idx < 3 ? "front" : "second";
    return (card.slots || []).includes(row);
  }

  function allNames(d) {
    return [...d.board, ...d.hand, d.field].map((x) => (x || "").trim()).filter(Boolean);
  }

  function validateDeck(d) {
    const names = allNames(d);
    if (!d.board.some(Boolean)) return "牌組必須在場上至少放置一張單位卡。";
    if (d.hand.filter(Boolean).length > 3) return "手牌最多 3 張。";
    const uniq = names.filter((n) => {
      const c = byName[n];
      return c && c.usableInPlayerDeck;
    });
    if (new Set(uniq).size !== uniq.length) return "卡組內不可有重複卡名。";
    for (let i = 0; i < 6; i += 1) {
      const n = d.board[i];
      if (!n) continue;
      const c = byName[n];
      if (!c) return `未知卡牌：${n}`;
      if (!c.usableInPlayerDeck) return `「${n}」不能加入玩家棋組。`;
      if (!slotAllowed(c, "b" + i)) return `「${n}」不能放在該格。`;
    }
    d.hero = "";
    if (d.field) {
      const c = byName[d.field];
      if (!c) return `未知卡牌：${d.field}`;
      if (c.kind === "field") return "場地卡請放入手牌，開局後才可使用。";
      if (!slotAllowed(c, "field")) return "特殊格僅能放置極後排單位。";
      if (!c.usableInPlayerDeck) return `「${d.field}」不能加入玩家棋組。`;
    }
    for (const n of d.hand.filter(Boolean)) {
      const c = byName[n];
      if (!c) return `未知卡牌：${n}`;
      if (c.kind === "hero") return "英雄不可設定在手牌。";
      if (c.kind === "boss") return "首領卡不可設定在手牌。";
      if (!c.usableInPlayerDeck) return `「${n}」不能加入玩家棋組。`;
    }
    return "";
  }

  function renderSlots() {
    const front = $("slots-front");
    const second = $("slots-second");
    const hand = $("slots-hand");
    front.innerHTML = "";
    second.innerHTML = "";
    hand.innerHTML = "";
    for (let i = 0; i < 3; i += 1) {
      front.appendChild(slotEl("b" + i, COL_LABELS[i], deck.board[i]));
      second.appendChild(slotEl("b" + (i + 3), COL_LABELS[i], deck.board[i + 3]));
      hand.appendChild(slotEl("h" + i, "手牌 " + (i + 1), deck.hand[i] || ""));
    }
    const fieldName = document.querySelector('[data-slot="field"] .slot-name');
    if (fieldName) fieldName.textContent = deck.field || "（空）";
    document.querySelectorAll(".slot").forEach((el) => {
      const key = el.dataset.slot;
      el.classList.toggle("selected", key === selectedSlot);
      const filled = key === "hero" ? !!deck.hero : key === "field" ? !!deck.field : !!nameAt(key);
      el.classList.toggle("filled", filled);
    });
    const err = validateDeck(deck);
    const st = $("deck-status");
    st.textContent = err || "卡組格式可用（尚未檢查抽卡持有）。";
    st.className = "status " + (err ? "bad" : "ok");
    try {
      $("share-code").value = err ? "" : encodeShare(deck);
    } catch (_e) {
      $("share-code").value = "";
    }
  }

  function slotEl(key, title, name) {
    const el = document.createElement("div");
    el.className = "slot";
    el.dataset.slot = key;
    el.innerHTML = `<span class="slot-title">${title}</span><span class="slot-name">${escapeHtml(name || "（空）")}</span>`;
    return el;
  }

  function nameAt(slot) {
    if (slot === "hero") return deck.hero;
    if (slot === "field") return deck.field;
    if (slot.startsWith("h")) return deck.hand[Number(slot.slice(1))] || "";
    return deck.board[Number(slot.slice(1))] || "";
  }

  function setNameAt(slot, name) {
    if (slot === "hero") deck.hero = name;
    else if (slot === "field") deck.field = name;
    else if (slot.startsWith("h")) {
      const i = Number(slot.slice(1));
      const hand = [...deck.hand];
      while (hand.length < 3) hand.push("");
      hand[i] = name;
      deck.hand = hand;
    } else deck.board[Number(slot.slice(1))] = name;
  }

  document.querySelector(".board").addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    selectedSlot = slot.dataset.slot;
    renderSlots();
    renderDeckList();
  });

  ["deck-q", "deck-kind", "deck-rarity", "deck-season"].forEach((id) => {
    $(id).addEventListener("input", renderDeckList);
    $(id).addEventListener("change", renderDeckList);
  });

  function renderDeckList() {
    const q = $("deck-q").value.trim().toLowerCase();
    const kind = $("deck-kind").value;
    const rarity = $("deck-rarity").value;
    const season = $("deck-season").value;
    const list = CARDS.filter((c) => c.usableInPlayerDeck && slotAllowed(c, selectedSlot)).filter((c) =>
      cardMatches(c, q, kind, rarity, season)
    );
    $("deck-hint").textContent = `可放 ${list.length} 張（名稱顏色＝稀有度）`;
    $("deck-list").innerHTML =
      `<button type="button" data-name="">（清空此格）</button>` +
      list
        .map(
          (c) =>
            `<button type="button" class="${rarityTextClass(c)}" data-name="${escapeHtml(c.name)}">${escapeHtml(
              c.name
            )}</button>`
        )
        .join("");
  }

  $("deck-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-name]");
    if (!btn) return;
    setNameAt(selectedSlot, btn.dataset.name);
    saveDeck();
    renderSlots();
  });

  $("deck-clear").addEventListener("click", () => {
    deck = emptyDeck();
    saveDeck();
    renderSlots();
  });

  function compactHand(d) {
    return (d.hand || []).map((x) => x.trim()).filter(Boolean);
  }

  function bytesToB64(bytes) {
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function b64ToBytes(tok) {
    const pad = tok + "=".repeat((4 - (tok.length % 4)) % 4);
    const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }

  function slotNames(d) {
    const board = [...(d.board || [])];
    while (board.length < 6) board.push("");
    const hand = [...(d.hand || [])];
    while (hand.length < 3) hand.push("");
    return [...board.slice(0, 6), ...hand.slice(0, 3), d.hero || "", ""].map((x) => String(x || "").trim());
  }

  function encodeShare(d) {
    const index = Object.fromEntries(SHARE_NAMES.map((n, i) => [n, i + 1]));
    const buf = new Uint8Array(7 + 11 * 2);
    buf[0] = 3;
    buf[1] = SHARE_MAJOR & 255;
    buf[2] = SHARE_MINOR & 255;
    buf[3] = (SHARE_FP >> 8) & 255;
    buf[4] = SHARE_FP & 255;
    const nonce = crypto.getRandomValues(new Uint8Array(2));
    buf[5] = nonce[0];
    buf[6] = nonce[1];
    slotNames(d).forEach((n, i) => {
      const v = n ? index[n] || 0 : 0;
      if (n && !v) throw new Error("未知卡牌：" + n);
      const o = 7 + i * 2;
      buf[o] = (v >> 8) & 255;
      buf[o + 1] = v & 255;
    });
    return "L3." + bytesToB64(buf);
  }

  function deckFromSlots(slots) {
    while (slots.length < 11) slots.push("");
    return {
      board: slots.slice(0, 6).map((x) => String(x || "")),
      hand: slots.slice(6, 9).map((x) => String(x || "")),
      hero: slots[9] ? String(slots[9]) : "",
      field: "",
    };
  }

  function decodeL3(tok) {
    const bytes = b64ToBytes(tok);
    if (bytes.length < 29) throw new Error("short");
    if (bytes[0] !== 3) throw new Error("ver");
    if (bytes[1] !== (SHARE_MAJOR & 255) || bytes[2] !== (SHARE_MINOR & 255)) throw new Error("game version");
    const fp = (bytes[3] << 8) | bytes[4];
    if (fp !== SHARE_FP) throw new Error("fingerprint");
    const slots = [];
    for (let i = 0; i < 11; i += 1) {
      const v = (bytes[7 + i * 2] << 8) | bytes[8 + i * 2];
      if (!v) {
        slots.push("");
        continue;
      }
      if (v < 1 || v > SHARE_NAMES.length) throw new Error("idx");
      slots.push(SHARE_NAMES[v - 1]);
    }
    return deckFromSlots(slots);
  }

  function decodeShare(code) {
    const raw = String(code || "").trim();
    if (raw.startsWith("L3.")) return decodeL3(raw.slice(3));
    throw new Error("bad prefix");
  }

  $("deck-copy").addEventListener("click", async () => {
    const err = validateDeck(deck);
    if (err) {
      $("deck-status").textContent = err;
      return;
    }
    const code = encodeShare(deck);
    $("share-code").value = code;
    let registered = false;
    if (SHARE_API_LOCAL && SHARE_API) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (SHARE_SECRET) headers["X-Share-Secret"] = SHARE_SECRET;
        const res = await fetch(SHARE_API + "/api/share-codes", {
          method: "POST",
          headers,
          body: JSON.stringify({ code }),
        });
        registered = res.ok;
      } catch (_e) {
        registered = false;
      }
    }
    try {
      await navigator.clipboard.writeText(code);
    } catch (_e) {}
    if (registered) {
      $("deck-status").textContent = "已複製並登錄分享碼（可於 Discord 匯入）。";
      $("deck-status").className = "status ok";
    } else if (!SHARE_API_LOCAL) {
      $("deck-status").textContent = "已複製分享碼。公開網站不會登錄本機機器人；要在 Discord 匯入請用本機網站並先啟動 bot。";
      $("deck-status").className = "status bad";
    } else {
      $("deck-status").textContent = "已產生 L3，但未登錄本機機器人；Discord 匯入會失效。請先啟動 bot 再複製。";
      $("deck-status").className = "status bad";
    }
  });

  $("deck-export").addEventListener("click", () => {
    download(
      "loadout.json",
      JSON.stringify({ board: deck.board, hand: compactHand(deck), hero: deck.hero || null, field: deck.field || null }, null, 2)
    );
  });

  $("deck-import").addEventListener("click", () => {
    try {
      deck = decodeShare($("share-code").value);
      saveDeck();
      renderSlots();
    } catch (_e) {
      $("deck-status").textContent = "分享碼無法解析（若為舊卡冊產生的 L2，請改用 JSON）。";
      $("deck-status").className = "status bad";
    }
  });

  function attackTypeSelect(key, value) {
    const v = value || "melee";
    return `<label>${escapeHtml("傷害類型")}
      <select data-param="${escapeHtml(key)}">
        <option value="melee"${v === "melee" ? " selected" : ""}>近戰</option>
        <option value="ranged"${v === "ranged" ? " selected" : ""}>遠程</option>
        <option value="undead"${v === "undead" ? " selected" : ""}>亡靈</option>
      </select>
    </label>`;
  }

  function renderParam(p) {
    if (p.type === "attackType") return attackTypeSelect(p.key, p.default);
    if (p.type === "select") {
      const cur = p.default != null ? String(p.default) : ((p.options && p.options[0] && p.options[0].value) || "");
      const opts = (p.options || [])
        .map((o) => `<option value="${escapeHtml(o.value)}"${String(o.value) === cur ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
        .join("");
      return `<label>${escapeHtml(p.label)} <select data-param="${escapeHtml(p.key)}">${opts}</select></label>`;
    }
    if (p.type === "text") {
      return `<label>${escapeHtml(p.label)} <input data-param="${escapeHtml(p.key)}" type="text" value="${escapeHtml(p.default || "")}" /></label>`;
    }
    const min = p.min != null ? p.min : 0;
    const def = p.default != null ? p.default : min;
    return `<label>${escapeHtml(p.label)} <input data-param="${escapeHtml(p.key)}" type="number" min="${min}" value="${def}" /></label>`;
  }

  function renderEffectPicker() {
    const box = $("studio-effects");
    box.innerHTML = EFFECT_TEMPLATES.map((t) => {
      const params = (t.params || []).map(renderParam).join("");
      const hint = t.hint || "";
      return `<div class="effect-item" data-group="${escapeHtml(t.group)}" data-id="${escapeHtml(t.id)}" data-name="${escapeHtml(t.name)}" data-hint="${escapeHtml(hint)}" title="${escapeHtml(hint)}">
        <label class="effect-head"><input type="checkbox" value="${escapeHtml(t.id)}" /> ${escapeHtml(t.name)}</label>
        ${params ? `<div class="params">${params}</div>` : ""}
      </div>`;
    }).join("");
    box.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", filterStudioEffects);
    });
    syncStudioKind();
    filterStudioEffects();
  }

  function filterStudioEffects() {
    const q = ($("studio-effect-q").value || "").trim().toLowerCase();
    document.querySelectorAll("#studio-effects .effect-item").forEach((el) => {
      const cb = el.querySelector("input[type=checkbox]");
      const name = (el.dataset.name || "").toLowerCase();
      const hint = (el.dataset.hint || "").toLowerCase();
      const show = !q || name.includes(q) || hint.includes(q) || (cb && cb.checked);
      el.classList.toggle("effect-miss", !show);
    });
  }

  $("studio-effect-q").addEventListener("input", filterStudioEffects);

  function emptySkillRow() {
    return { name: "", text: "" };
  }

  let skillRows = [emptySkillRow()];

  function renderSkillRows() {
    const box = $("studio-skill-list");
    box.innerHTML = skillRows
      .map(
        (row, i) => `<div class="skill-row" data-i="${i}">
          <label>技能名 <input data-skill="name" value="${escapeHtml(row.name)}" maxlength="20" /></label>
          <label>說明 <input data-skill="text" value="${escapeHtml(row.text)}" maxlength="120" /></label>
          <button type="button" data-skill-del="${i}" ${skillRows.length <= 1 ? "disabled" : ""}>刪</button>
        </div>`
      )
      .join("");
  }

  function readSkillRows() {
    const rows = [];
    document.querySelectorAll("#studio-skill-list .skill-row").forEach((el) => {
      rows.push({
        name: (el.querySelector('[data-skill="name"]').value || "").trim(),
        text: (el.querySelector('[data-skill="text"]').value || "").trim(),
      });
    });
    skillRows = rows.length ? rows : [emptySkillRow()];
  }

  $("studio-add-skill").addEventListener("click", () => {
    readSkillRows();
    skillRows.push(emptySkillRow());
    renderSkillRows();
  });

  $("studio-skill-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-skill-del]");
    if (!btn || btn.disabled) return;
    readSkillRows();
    const i = Number(btn.dataset.skillDel);
    skillRows.splice(i, 1);
    if (!skillRows.length) skillRows = [emptySkillRow()];
    renderSkillRows();
  });

  function collectSkills() {
    readSkillRows();
    return skillRows.filter((s) => s.name);
  }

  function syncStudioKind() {
    const kind = $("studio-kind").value;
    const isSpell = kind === "spell";
    const needsSkills = kind === "boss";
    $("studio-unit-stats").classList.toggle("hidden", isSpell);
    $("studio-spell-stats").classList.toggle("hidden", !isSpell);
    $("studio-skills").classList.toggle("hidden", !needsSkills);
    document.querySelectorAll("#studio-effects .effect-item").forEach((el) => {
      const group = el.dataset.group;
      const show = isSpell ? group === "spell" || group === "shared" : group === "unit" || group === "shared";
      el.classList.toggle("hidden", !show);
      if (!show) {
        const cb = el.querySelector("input[type=checkbox]");
        if (cb) cb.checked = false;
      }
    });
    filterStudioEffects();
  }

  $("studio-kind").addEventListener("change", syncStudioKind);

  function collectEffects(kind) {
    const out = [];
    document.querySelectorAll("#studio-effects .effect-item").forEach((el) => {
      const group = el.dataset.group;
      const wanted = kind === "spell" ? group === "spell" || group === "shared" : group === "unit" || group === "shared";
      if (!wanted) return;
      const cb = el.querySelector("input[type=checkbox]");
      if (!cb || !cb.checked) return;
      const tmpl = EFFECT_TEMPLATES.find((t) => t.id === cb.value);
      const params = {};
      el.querySelectorAll("[data-param]").forEach((inp) => {
        params[inp.dataset.param] = inp.type === "number" ? Number(inp.value) : String(inp.value);
      });
      out.push({ id: cb.value, name: tmpl ? tmpl.name : cb.value, params });
    });
    return out;
  }

  function applySharedEffectFields(draft, e) {
    if (e.id === "pierce") draft.bypassDefense = true;
    if (e.id === "spell_reborn") draft.spellRebornFromDiscard = Number(e.params.count || 0);
    if (e.id === "unit_reborn") draft.unitRebornFromGraveyard = Number(e.params.count || 1);
    if (e.id === "heal") draft.endOfTurnHeal = Number(e.params.amount || 0);
    if (e.id === "turn_invincible") draft.turnInvincibleSide = String(e.params.side || "ally");
    if (e.id === "death_countdown") draft.deathCountdownTurns = Number(e.params.turns || 0);
    if (e.id === "spell_ban") draft.spellBan = true;
    if (e.id === "until_death") draft.untilDeath = true;
    if (e.id === "root") draft.root = true;
    if (e.id === "cannot_counter") draft.cannotCounterPermanent = true;
    if (e.id === "cannot_attack") draft.cannotAttack = true;
    if (e.id === "cannot_reborn") draft.cannotReborn = true;
    if (e.id === "extra_hand") draft.extraHand = true;
    if (e.id === "mind_crush") draft.mindCrushValue = Number(e.params.value || 0);
    if (e.id === "persist") {
      draft.persistTurns = Number(e.params.turns || 0);
      draft.persistMeleeDamage = Number(e.params.damage || 0);
    }
  }

  function applyEffectFields(draft, effects, kind) {
    if (kind === "spell") {
      effects.forEach((e) => {
        applySharedEffectFields(draft, e);
        if (e.id === "aoe") draft.targetAllEnemies = true;
        if (e.id === "poison") {
          draft.applyPoisonUntilDeath = true;
          draft.poisonDamage = Number(e.params.damage || 0);
        }
        if (e.id === "temp_shield") draft.summonTempShield = true;
        if (e.id === "team_shield") draft.lastWordsTeamShield = Number(e.params.amount || 0);
        if (e.id === "soul_collector") draft.soulCollector = true;
      });
      return;
    }
    effects.forEach((e) => {
      applySharedEffectFields(draft, e);
      if (e.id === "actor") draft.actor = true;
      if (e.id === "suppress_counter") draft.suppressCounter = true;
      if (e.id === "no_wash") draft.noWash = true;
      if (e.id === "immune_death") draft.immuneDeathCharges = Number(e.params.charges || 0);
      if (e.id === "immune_damage") draft.immuneAttackTypes = [String(e.params.attackType || "melee")];
      if (e.id === "lifesteal") draft.lifesteal = true;
      if (e.id === "fixed") draft.fixed = true;
      if (e.id === "lone_wolf") draft.loneWolf = true;
      if (e.id === "ascension") {
        draft.ascensionTurns = Number(e.params.turns || 0);
        draft.ascensionEffect = String(e.params.effect || "");
      }
      if (e.id === "stun_on_hit") draft.stunOnHit = true;
      if (e.id === "back_row_attack") draft.backRowAttack = true;
      if (e.id === "fatal_protect") draft.fatalProtectCharges = Number(e.params.charges || 0);
      if (e.id === "cover") draft.cover = true;
      if (e.id === "revenge") draft.revengeCount = Number(e.params.count || 0);
      if (e.id === "divine_creation") draft.divineCreation = true;
      if (e.id === "dodge") draft.dodge = true;
      if (e.id === "stealth") draft.stealthTurns = Number(e.params.turns || 0);
      if (e.id === "extreme_back_row") draft.extremeBackRow = true;
      if (e.id === "taunt") draft.taunt = true;
      if (e.id === "ignore_damage") draft.ignoreAttackTypes = [String(e.params.attackType || "melee")];
      if (e.id === "cannot_protect_back_row") draft.cannotProtectBackRow = true;
      if (e.id === "strong_counter") draft.strongCounter = true;
      if (e.id === "soul_collector") draft.soulCollector = true;
      if (e.id === "execute") draft.executeThreshold = Number(e.params.threshold || 0);
      if (e.id === "desperation") draft.desperationTurns = Number(e.params.turns || 0);
      if (e.id === "critical") draft.criticalHitBonus = Number(e.params.bonus || 0);
      if (e.id === "grow_stronger") draft.growStrongerBonus = Number(e.params.bonus || 0);
      if (e.id === "overkill_immune") draft.overkillImmuneValue = Number(e.params.value || 0);
      if (e.id === "war_prep") draft.warPrepBonus = Number(e.params.bonus || 0);
      if (e.id === "last_words") draft.lastWordsEffect = String(e.params.effect || "");
      if (e.id === "team_shield") draft.lastWordsTeamShield = Number(e.params.amount || 0);
      if (e.id === "splash") {
        draft.splashFollowsAttack = true;
        draft.splashDamage = Number(e.params.damage || 0);
      }
    });
  }

  $("studio-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const kind = String(fd.get("kind"));
    const cooldownMax = Number(fd.get("cooldownMax") || 0);
    const draft = {
      name: String(fd.get("name") || "").trim(),
      kind,
      rarity: String(fd.get("rarity")),
      season: Number(fd.get("season") || 5),
      cooldownMax,
      usesCooldown: cooldownMax > 0,
      notes: String(fd.get("notes") || "").trim(),
    };
    if (!draft.name) return;
    const status = $("studio-status");
    if (kind === "boss") {
      const skills = collectSkills();
      if (skills.length) draft.skills = skills;
    }
    if (kind === "spell") {
      draft.attack = Number(fd.get("spellAttack") || 0);
      draft.executeThreshold = Number(fd.get("executeThreshold") || 0);
      draft.delayTurns = Number(fd.get("delayTurns") || 0);
    } else {
      draft.attackValues = {
        melee: Number(fd.get("melee") || 0),
        ranged: Number(fd.get("ranged") || 0),
        undead: Number(fd.get("undead") || 0),
      };
      draft.attackCount = Number(fd.get("attackCount") || 0);
      draft.defense = Number(fd.get("defense") || 0);
      draft.hp = Number(fd.get("hp") || 0);
    }
    const effects = collectEffects(kind);
    if (kind === "spell") {
      const dmgType = String(fd.get("spellDamageType") || "");
      const poison = effects.some((x) => x.id === "poison");
      const isDamage = draft.attack > 0 || Number(draft.executeThreshold || 0) > 0 || poison;
      if (isDamage && !["melee", "ranged", "undead"].includes(dmgType)) {
        status.textContent = "傷害法術必須指定傷害類型（近戰／遠程／亡靈）。";
        status.className = "status bad";
        return;
      }
      if (["melee", "ranged", "undead"].includes(dmgType)) {
        draft.damageAttackType = dmgType;
      }
    }
    draft.appliedEffects = effects;
    applyEffectFields(draft, effects, kind);
    if (kind === "spell" && draft.applyPoisonUntilDeath && draft.damageAttackType) {
      draft.poisonAttackType = draft.damageAttackType;
    }
    drafts = [draft, ...drafts.filter((x) => x.name !== draft.name)];
    saveDrafts();
    renderDrafts();
    e.target.reset();
    $("studio-form").elements.cooldownMax.value = "1";
    skillRows = [emptySkillRow()];
    renderSkillRows();
    status.textContent = "已加入草稿。";
    status.className = "status ok";
    renderEffectPicker();
  });

  $("studio-export").addEventListener("click", () => {
    download("card-drafts.json", JSON.stringify(drafts, null, 2));
  });

  function renderDrafts() {
    $("draft-list").innerHTML = drafts.length
      ? drafts
          .map(
            (d) =>
              `<button type="button" data-del="${escapeHtml(d.name)}">${escapeHtml(d.name)}　S${d.season}　點此刪除</button>`
          )
          .join("")
      : "<p class='muted'>尚無草稿。</p>";
  }

  $("draft-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    drafts = drafts.filter((d) => d.name !== btn.dataset.del);
    saveDrafts();
    renderDrafts();
  });

  function download(filename, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  renderSkillRows();
  renderEffectPicker();
  renderCatalog();
  renderUnitTables();
  renderBosses();
  renderGlossary();
  renderSlots();
  renderDeckList();
  renderDrafts();
})();
