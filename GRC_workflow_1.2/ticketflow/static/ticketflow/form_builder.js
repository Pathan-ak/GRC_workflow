/**
 * Visual form builder — state in memory, Sortable reorder, save as JSON to API.
 */
(function () {
  "use strict";

  function genKey() {
    return "k" + Math.random().toString(36).slice(2, 12);
  }

  function ensureKeys(node, prefix) {
    if (!node._key) node._key = node.id ? prefix + node.id : genKey();
  }

  function walkState(st) {
    (st.tabs || []).forEach(function (tab) {
      ensureKeys(tab, "t-");
      (tab.sections || []).forEach(function (sec) {
        ensureKeys(sec, "s-");
        (sec.fields || []).forEach(function (f) {
          ensureKeys(f, "f-");
        });
      });
    });
  }

  function stripKeysForApi(obj) {
    return JSON.parse(
      JSON.stringify(obj, function (k, v) {
        if (k === "_key") return undefined;
        return v;
      })
    );
  }

  var state = { tabs: [] };
  /** Selection uses stable _keys so it stays correct after tab/section reorder. */
  var selected = null; // { type:'tab'|'section'|'field', tabKey, secKey?, fldKey? }
  var formId = null;
  var apiUrl = "";
  var historyStack = [];
  var HISTORY_LIMIT = 150;

  function currentStateSnapshot() {
    return JSON.stringify(stripKeysForApi({ tabs: state.tabs }));
  }

  function pushHistorySnapshot() {
    var snap = currentStateSnapshot();
    if (historyStack.length && historyStack[historyStack.length - 1] === snap) {
      return;
    }
    historyStack.push(snap);
    if (historyStack.length > HISTORY_LIMIT) {
      historyStack.shift();
    }
  }

  function undo() {
    if (!historyStack.length) return;
    var previous = historyStack.pop();
    try {
      var parsed = JSON.parse(previous);
      state.tabs = parsed.tabs || [];
      walkState(state);
      selected = null;
      render();
      var msg = document.getElementById("fb-msg");
      if (msg) {
        msg.className = "fb-msg ok";
        msg.textContent = "Undid last change.";
      }
    } catch (e) {
      var msgErr = document.getElementById("fb-msg");
      if (msgErr) {
        msgErr.className = "fb-msg err";
        msgErr.textContent = "Undo failed: " + (e.message || String(e));
      }
    }
  }

  /**
   * Resolve current indices from key-based selection. Returns null if targets were removed.
   */
  function resolveSelectedIndices() {
    if (!selected || !selected.tabKey) return null;
    var ti = state.tabs.findIndex(function (t) {
      return t._key === selected.tabKey;
    });
    if (ti < 0) return null;
    var tab = state.tabs[ti];
    if (selected.type === "tab") {
      return { ti: ti, si: null, fi: null, tab: tab };
    }
    if (!selected.secKey) return null;
    var si = tab.sections
      ? tab.sections.findIndex(function (s) {
          return s._key === selected.secKey;
        })
      : -1;
    if (si < 0) return null;
    var sec = tab.sections[si];
    if (selected.type === "section") {
      return { ti: ti, si: si, fi: null, tab: tab, sec: sec };
    }
    if (!selected.fldKey) return null;
    var fi = sec.fields
      ? sec.fields.findIndex(function (f) {
          return f._key === selected.fldKey;
        })
      : -1;
    if (fi < 0) return null;
    return {
      ti: ti,
      si: si,
      fi: fi,
      tab: tab,
      sec: sec,
      field: sec.fields[fi],
    };
  }

  function invalidateSelectionIfStale() {
    if (!selected) return;
    if (!resolveSelectedIndices()) {
      selected = null;
    }
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") e.className = attrs[k];
        else if (k === "textContent") e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    if (html) e.innerHTML = html;
    return e;
  }

  function getCsrfToken() {
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    if (m) return m[1];
    var inp = document.querySelector("[name=csrfmiddlewaretoken]");
    return inp ? inp.value : "";
  }

  function renderProps() {
    var box = document.getElementById("fb-props-content");
    if (!box) return;
    box.innerHTML = "";
    if (!selected) {
      box.appendChild(el("p", { textContent: "Select a tab, section, or field." }));
      return;
    }

    var resolved = resolveSelectedIndices();
    if (!resolved) {
      selected = null;
      box.appendChild(el("p", { textContent: "Select a tab, section, or field." }));
      return;
    }

    if (selected.type === "tab") {
      var tab = resolved.tab;
      box.appendChild(el("label", {}, "Tab name"));
      var in1 = el("input", { type: "text", value: tab.name });
      in1.addEventListener("input", function () {
        pushHistorySnapshot();
        tab.name = in1.value;
        render();
      });
      box.appendChild(in1);
      box.appendChild(el("label", {}, "Description"));
      var in2 = document.createElement("textarea");
      in2.value = tab.description || "";
      in2.addEventListener("input", function () {
        pushHistorySnapshot();
        tab.description = in2.value;
      });
      box.appendChild(in2);
      box.appendChild(el("label", {}, "Icon (optional)"));
      var in3 = el("input", { type: "text", value: tab.icon || "" });
      in3.addEventListener("input", function () {
        pushHistorySnapshot();
        tab.icon = in3.value;
      });
      box.appendChild(in3);
      return;
    }

    if (selected.type === "section") {
      var sec = resolved.sec;
      box.appendChild(el("label", {}, "Section title"));
      var s1 = el("input", { type: "text", value: sec.name });
      s1.addEventListener("input", function () {
        pushHistorySnapshot();
        sec.name = s1.value;
        render();
      });
      box.appendChild(s1);
      box.appendChild(el("label", {}, "Description"));
      var s2 = document.createElement("textarea");
      s2.value = sec.description || "";
      s2.addEventListener("input", function () {
        pushHistorySnapshot();
        sec.description = s2.value;
      });
      box.appendChild(s2);
      box.appendChild(el("label", {}, "Columns (layout)"));
      var sel = el("select", {});
      [1, 2, 3, 4].forEach(function (n) {
        var o = el("option", { value: String(n) }, String(n));
        if (Number(sec.columns || 1) === n) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        pushHistorySnapshot();
        sec.columns = parseInt(sel.value, 10);
        render();
      });
      box.appendChild(sel);
      var cb = el("input", { type: "checkbox" });
      cb.checked = !!sec.is_collapsible;
      cb.addEventListener("change", function () {
        pushHistorySnapshot();
        sec.is_collapsible = cb.checked;
      });
      var lab = el("label", {});
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" Collapsible"));
      box.appendChild(lab);
      return;
    }

    if (selected.type === "field") {
      var fld = resolved.field;
      var rows = [
        ["label", "Label", "text"],
        ["field_type", "Field type", "select"],
        ["placeholder", "Placeholder", "text"],
        ["help_text", "Help text", "textarea"],
        ["choices", "Choices (comma-separated, for dropdown/radio)", "textarea"],
        ["max_length", "Max length", "number"],
        ["column", "Column # (within section)", "number"],
        ["regex", "Validation regex", "text"],
        ["min_value", "Min value", "number"],
        ["max_value", "Max value", "number"],
      ];
      var types = [
        "text",
        "textarea",
        "select",
        "file",
        "email",
        "date",
        "number",
        "checkbox",
        "radio",
      ];

      rows.forEach(function (row) {
        box.appendChild(el("label", {}, row[1]));
        var name = row[0];
        var input;
        if (row[2] === "select" && name === "field_type") {
          input = el("select", {});
          types.forEach(function (t) {
            var o = el("option", { value: t }, t);
            if (fld.field_type === t) o.selected = true;
            input.appendChild(o);
          });
          input.addEventListener("change", function () {
            pushHistorySnapshot();
            fld.field_type = input.value;
            render();
          });
        } else if (row[2] === "textarea") {
          input = document.createElement("textarea");
          input.value = fld[name] != null ? String(fld[name]) : "";
          input.addEventListener("input", function () {
            pushHistorySnapshot();
            fld[name] = input.value;
          });
        } else {
          input = el("input", {
            type: row[2] === "number" ? "number" : "text",
            value:
              fld[name] != null && fld[name] !== ""
                ? String(fld[name])
                : "",
          });
          input.addEventListener("input", function () {
            pushHistorySnapshot();
            var v = input.value;
            if (row[2] === "number") {
              if (name === "min_value" || name === "max_value") {
                fld[name] = v === "" ? null : parseInt(v, 10);
              } else {
                fld[name] = v === "" ? null : parseInt(v, 10);
              }
            } else {
              fld[name] = v;
            }
          });
        }
        box.appendChild(input);
      });

      box.appendChild(el("label", {}, "Required"));
      var req = el("input", { type: "checkbox" });
      req.checked = !!fld.required;
      req.addEventListener("change", function () {
        pushHistorySnapshot();
        fld.required = req.checked;
      });
      box.appendChild(req);

      box.appendChild(el("label", {}, "Readonly"));
      var ro = el("input", { type: "checkbox" });
      ro.checked = !!fld.readonly;
      ro.addEventListener("change", function () {
        pushHistorySnapshot();
        fld.readonly = ro.checked;
      });
      box.appendChild(ro);

      box.appendChild(el("label", {}, "Hidden"));
      var hi = el("input", { type: "checkbox" });
      hi.checked = !!fld.hidden;
      hi.addEventListener("change", function () {
        pushHistorySnapshot();
        fld.hidden = hi.checked;
      });
      box.appendChild(hi);

      box.appendChild(el("label", {}, "Role"));
      var roleSel = el("select", {});
      [
        ["user", "Risk Representative"],
        ["dev", "Risk Champion"],
        ["ba", "Risk Approver"],
        ["pm", "CRO"],
      ].forEach(function (r) {
        var o = el("option", { value: r[0] }, r[1]);
        if ((fld.role || "user") === r[0]) o.selected = true;
        roleSel.appendChild(o);
      });
      roleSel.addEventListener("change", function () {
        pushHistorySnapshot();
        fld.role = roleSel.value;
      });
      box.appendChild(roleSel);
    }
  }

  function select(type, tabIndex, secIndex, fldIndex) {
    var tab = state.tabs[tabIndex];
    if (!tab) return;
    var tabKey = tab._key;
    var secKey = null;
    var fldKey = null;
    if (secIndex != null && secIndex >= 0 && tab.sections && tab.sections[secIndex]) {
      secKey = tab.sections[secIndex]._key;
      if (
        fldIndex != null &&
        fldIndex >= 0 &&
        tab.sections[secIndex].fields &&
        tab.sections[secIndex].fields[fldIndex]
      ) {
        fldKey = tab.sections[secIndex].fields[fldIndex]._key;
      }
    }
    selected = {
      type: type,
      tabKey: tabKey,
      secKey: secKey,
      fldKey: fldKey,
    };
    document.querySelectorAll(".fb-selected").forEach(function (n) {
      n.classList.remove("fb-selected");
    });
    var node = null;
    var canvas = document.getElementById("fb-canvas");
    if (canvas) {
      var tabNodes = canvas.querySelectorAll(".fb-tab");
      var tabEl = null;
      for (var ti = 0; ti < tabNodes.length; ti++) {
        if (tabNodes[ti].getAttribute("data-key") === tabKey) {
          tabEl = tabNodes[ti];
          break;
        }
      }
      if (type === "tab") {
        node = tabEl;
      } else if (type === "section" && secKey && tabEl) {
        var secNodes = tabEl.querySelectorAll(".fb-section");
        for (var sj = 0; sj < secNodes.length; sj++) {
          if (secNodes[sj].getAttribute("data-key") === secKey) {
            node = secNodes[sj];
            break;
          }
        }
      } else if (type === "field" && secKey && fldKey && tabEl) {
        var secNodes2 = tabEl.querySelectorAll(".fb-section");
        var secEl2 = null;
        for (var sk = 0; sk < secNodes2.length; sk++) {
          if (secNodes2[sk].getAttribute("data-key") === secKey) {
            secEl2 = secNodes2[sk];
            break;
          }
        }
        if (secEl2) {
          var fldNodes = secEl2.querySelectorAll(".fb-field");
          for (var fk = 0; fk < fldNodes.length; fk++) {
            if (fldNodes[fk].getAttribute("data-key") === fldKey) {
              node = fldNodes[fk];
              break;
            }
          }
        }
      }
    }
    if (node) node.classList.add("fb-selected");
    renderProps();
  }

  function render() {
    var canvas = document.getElementById("fb-canvas");
    if (!canvas) return;
    invalidateSelectionIfStale();
    canvas.innerHTML = "";

    if (!state.tabs.length) {
      canvas.appendChild(
        el("div", { className: "fb-empty" }, "Add a tab from the palette to start.")
      );
      renderProps();
      return;
    }

    var sortTabs = el("div", { className: "fb-tabs-sort" });
    state.tabs.forEach(function (tab, ti) {
      var tabEl = el("div", {
        className: "fb-tab",
        "data-tab-index": String(ti),
        "data-key": tab._key,
        "data-id": tab.id != null ? String(tab.id) : "",
      });
      if (selected && selected.type === "tab" && tab._key === selected.tabKey) {
        tabEl.classList.add("fb-selected");
        tabEl.classList.add("fb-container-focus");
      }

      var th = el("div", { className: "fb-tab-header" });
      th.appendChild(el("span", { className: "handle" }, "⋮⋮"));
      var title = el("input", {
        className: "fb-tab-title",
        type: "text",
        value: tab.name || "Tab",
      });
      title.addEventListener("click", function (e) {
        e.stopPropagation();
        select("tab", ti, null, null);
      });
      title.addEventListener("input", function () {
        pushHistorySnapshot();
        tab.name = title.value;
      });
      th.appendChild(title);
      var addSecBtn = el(
        "button",
        { type: "button", className: "btn-secondary" },
        "Add section"
      );
      addSecBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        addSection(ti);
      });
      th.appendChild(addSecBtn);
      var addFieldTabBtn = el(
        "button",
        { type: "button", className: "btn-secondary" },
        "Add field"
      );
      addFieldTabBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        select("tab", ti, null, null);
        addFieldFromPalette("text");
      });
      th.appendChild(addFieldTabBtn);
      var delTab = el(
        "button",
        { type: "button", className: "btn-secondary" },
        "Remove tab"
      );
      delTab.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Remove this tab and all sections/fields inside?")) {
          pushHistorySnapshot();
          state.tabs.splice(ti, 1);
          selected = null;
          render();
        }
      });
      th.appendChild(delTab);
      tabEl.appendChild(th);

      tabEl.addEventListener("click", function (e) {
        if (e.target.closest(".fb-section")) return;
        if (e.target.closest("button")) return;
        if (e.target.closest("input.fb-tab-title")) return;
        select("tab", ti, null, null);
      });

      var secSort = el("div", { className: "fb-sections-sort" });
      (tab.sections || []).forEach(function (sec, si) {
        var secEl = el("div", {
          className: "fb-section",
          "data-sec-index": String(si),
          "data-key": sec._key,
          "data-id": sec.id != null ? String(sec.id) : "",
        });
        if (
          selected &&
          selected.type === "section" &&
          tab._key === selected.tabKey &&
          sec._key === selected.secKey
        ) {
          secEl.classList.add("fb-selected");
          secEl.classList.add("fb-container-focus");
        }

        var sh = el("div", { className: "fb-section-header" });
        sh.appendChild(el("span", { className: "handle" }, "⋮⋮"));
        var st = el("input", {
          className: "fb-section-title",
          type: "text",
          value: sec.name || "Section",
        });
        st.addEventListener("click", function (e) {
          e.stopPropagation();
          select("section", ti, si, null);
        });
        st.addEventListener("input", function () {
          sec.name = st.value;
        });
        sh.appendChild(st);
        var meta = el("div", { className: "fb-section-meta" });
        meta.appendChild(document.createTextNode("Columns "));
        var colSel = el("select", { className: "section-cols" });
        [1, 2, 3, 4].forEach(function (n) {
          var o = el("option", { value: String(n) }, String(n) + " col");
          if (Number(sec.columns || 1) === n) o.selected = true;
          colSel.appendChild(o);
        });
        colSel.addEventListener("change", function () {
          pushHistorySnapshot();
          sec.columns = parseInt(colSel.value, 10);
          var fs = secEl.querySelector(".fb-fields-sort");
          if (fs) {
            fs.setAttribute("data-columns", String(sec.columns || 1));
          }
        });
        meta.appendChild(colSel);
        var rmSec = el("button", { type: "button", className: "btn-secondary" }, "Remove");
        rmSec.addEventListener("click", function (e) {
          e.stopPropagation();
          if (confirm("Remove this section?")) {
            pushHistorySnapshot();
            tab.sections.splice(si, 1);
            selected = null;
            render();
          }
        });
        var addFieldSec = el(
          "button",
          { type: "button", className: "btn-secondary" },
          "Add field"
        );
        addFieldSec.addEventListener("click", function (e) {
          e.stopPropagation();
          select("section", ti, si, null);
          addField(ti, si, "text");
        });
        meta.appendChild(addFieldSec);
        meta.appendChild(rmSec);
        sh.appendChild(meta);
        secEl.appendChild(sh);

        secEl.addEventListener("click", function (e) {
          if (e.target.closest(".fb-field")) return;
          if (e.target.closest("button")) return;
          if (e.target.closest("input.fb-section-title")) return;
          if (e.target.closest("select.section-cols")) return;
          select("section", ti, si, null);
        });

        var fldSort = el("div", {
          className: "fb-fields-sort fb-fields",
          "data-columns": String(sec.columns || 1),
        });
        (sec.fields || []).forEach(function (fld, fi) {
          var fldEl = el("div", {
            className: "fb-field",
            "data-fld-index": String(fi),
            "data-key": fld._key,
            "data-id": fld.id != null ? String(fld.id) : "",
          });
          if (
            selected &&
            selected.type === "field" &&
            tab._key === selected.tabKey &&
            sec._key === selected.secKey &&
            fld._key === selected.fldKey
          )
            fldEl.classList.add("fb-selected");
          var ft = el("div", { className: "fb-field-top" });
          ft.appendChild(el("span", { className: "handle" }, "⋮"));
          var fl = el("input", {
            className: "fb-field-label",
            type: "text",
            value: fld.label || "Field",
          });
          fl.addEventListener("click", function (e) {
            e.stopPropagation();
            select("field", ti, si, fi);
          });
          fl.addEventListener("input", function () {
            pushHistorySnapshot();
            fld.label = fl.value;
          });
          ft.appendChild(fl);
          ft.appendChild(
            el("span", { className: "fb-field-type" }, fld.field_type || "text")
          );
          var delFieldBtn = el(
            "button",
            { type: "button", className: "fb-field-delete", title: "Delete field", "aria-label": "Delete field" },
            "✕"
          );
          delFieldBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            pushHistorySnapshot();
            sec.fields.splice(fi, 1);
            selected = null;
            render();
          });
          ft.appendChild(delFieldBtn);
          fldEl.appendChild(ft);
          fldEl.addEventListener("click", function () {
            select("field", ti, si, fi);
          });
          fldSort.appendChild(fldEl);
        });
        secEl.appendChild(fldSort);
        secSort.appendChild(secEl);
      });
      tabEl.appendChild(secSort);
      sortTabs.appendChild(tabEl);
    });
    canvas.appendChild(sortTabs);

    if (window.Sortable) {
      Sortable.create(sortTabs, {
        handle: ".fb-tab-header .handle",
        animation: 150,
        onEnd: function () {
          pushHistorySnapshot();
          var keys = Array.from(sortTabs.children).map(function (c) {
            return c.getAttribute("data-key");
          });
          var map = {};
          state.tabs.forEach(function (t) {
            map[t._key] = t;
          });
          state.tabs = keys.map(function (k) {
            return map[k];
          }).filter(Boolean);
          render();
        },
      });
      sortTabs.querySelectorAll(".fb-sections-sort").forEach(function (secContainer, idx) {
        var tabIdx = parseInt(
          secContainer.closest(".fb-tab").getAttribute("data-tab-index"),
          10
        );
        Sortable.create(secContainer, {
          handle: ".fb-section-header .handle",
          animation: 150,
          onEnd: function () {
            pushHistorySnapshot();
            var tab = state.tabs[tabIdx];
            var keys = Array.from(secContainer.children).map(function (c) {
              return c.getAttribute("data-key");
            });
            var smap = {};
            tab.sections.forEach(function (s) {
              smap[s._key] = s;
            });
            tab.sections = keys.map(function (k) {
              return smap[k];
            }).filter(Boolean);
            render();
          },
        });
      });
      sortTabs.querySelectorAll(".fb-fields-sort").forEach(function (fldContainer) {
        Sortable.create(fldContainer, {
          group: {
            name: "fb-fields",
            pull: true,
            put: true,
          },
          handle: ".fb-field-top .handle",
          animation: 150,
          ghostClass: "fb-sortable-ghost",
          chosenClass: "fb-sortable-chosen",
          dragClass: "fb-sortable-drag",
          fallbackOnBody: true,
          swapThreshold: 0.65,
          emptyInsertThreshold: 40,
          onEnd: function () {
            pushHistorySnapshot();
            rebuildFieldsFromDom();
            render();
          },
        });
      });
    }

    renderProps();
  }

  function addTab() {
    pushHistorySnapshot();
    state.tabs.push({
      id: null,
      name: "New tab",
      description: "",
      order: state.tabs.length,
      icon: "",
      sections: [],
    });
    ensureKeys(state.tabs[state.tabs.length - 1], "t-");
    render();
    select("tab", state.tabs.length - 1, null, null);
  }

  /**
   * Add a field from the palette using the current selection:
   * - field selected → same section as that field
   * - section selected → that section
   * - tab selected → last section in that tab (or create a section if none)
   * - nothing selected → last tab, last section (create tab/section if needed)
   */
  function addFieldFromPalette(fieldType) {
    var ft = fieldType || "text";
    if (!state.tabs.length) {
      addTab();
      addSection(0);
      addField(0, 0, ft);
      return;
    }
    invalidateSelectionIfStale();
    var ti;
    var si;
    var r = resolveSelectedIndices();
    if (selected && r) {
      if (selected.type === "field") {
        ti = r.ti;
        si = r.si;
      } else if (selected.type === "section") {
        ti = r.ti;
        si = r.si;
      } else if (selected.type === "tab") {
        ti = r.ti;
        var tab = state.tabs[ti];
        if (!tab.sections || !tab.sections.length) {
          addSection(ti);
          si = state.tabs[ti].sections.length - 1;
          addField(ti, si, ft);
          return;
        }
        si = tab.sections.length - 1;
      }
    }
    if (ti === undefined || si === undefined) {
      ti = state.tabs.length - 1;
      var t = state.tabs[ti];
      if (!t.sections || !t.sections.length) {
        addSection(ti);
      }
      si = state.tabs[ti].sections.length - 1;
    }
    addField(ti, si, ft);
  }

  /**
   * After cross-list field drag, rebuild sec.fields from DOM order.
   * Uses data-key (not array indices) so parent/child matches DOM after reorder.
   */
  function rebuildFieldsFromDom() {
    var keyMap = {};
    state.tabs.forEach(function (tab) {
      (tab.sections || []).forEach(function (sec) {
        (sec.fields || []).forEach(function (f) {
          keyMap[f._key] = f;
        });
      });
    });
    var canvas = document.getElementById("fb-canvas");
    if (!canvas) return;
    canvas.querySelectorAll(".fb-tab").forEach(function (tabEl) {
      var tabKey = tabEl.getAttribute("data-key");
      var tab = state.tabs.find(function (t) {
        return t._key === tabKey;
      });
      if (!tab) return;
      tabEl.querySelectorAll(".fb-sections-sort > .fb-section").forEach(function (secEl) {
        var secKey = secEl.getAttribute("data-key");
        var sec = (tab.sections || []).find(function (s) {
          return s._key === secKey;
        });
        if (!sec) return;
        var cont = secEl.querySelector(".fb-fields-sort");
        if (!cont) return;
        var keys = Array.from(cont.querySelectorAll(":scope > .fb-field")).map(function (n) {
          return n.getAttribute("data-key");
        });
        sec.fields = keys
          .map(function (k) {
            return keyMap[k];
          })
          .filter(Boolean);
      });
    });
  }

  function addSection(tabIndex) {
    pushHistorySnapshot();
    var tab = state.tabs[tabIndex];
    if (!tab.sections) tab.sections = [];
    tab.sections.push({
      id: null,
      name: "New section",
      description: "",
      order: tab.sections.length,
      is_collapsible: false,
      columns: 1,
      fields: [],
    });
    ensureKeys(tab.sections[tab.sections.length - 1], "s-");
    render();
    select("section", tabIndex, tab.sections.length - 1, null);
  }

  function addField(tabIndex, secIndex, fieldType) {
    pushHistorySnapshot();
    var sec = state.tabs[tabIndex].sections[secIndex];
    if (!sec.fields) sec.fields = [];
    sec.fields.push({
      id: null,
      label: "New field",
      field_type: fieldType || "text",
      required: false,
      help_text: "",
      choices: "",
      max_length: null,
      order: sec.fields.length,
      column: 1,
      column_width: null,
      role: "user",
      placeholder: "",
      default_value: "",
      min_value: null,
      max_value: null,
      regex: "",
      readonly: false,
      hidden: false,
    });
    ensureKeys(sec.fields[sec.fields.length - 1], "f-");
    render();
    select("field", tabIndex, secIndex, sec.fields.length - 1);
  }

  function save() {
    var payload = stripKeysForApi({ tabs: state.tabs });
    var msg = document.getElementById("fb-msg");
    fetch(apiUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (_ref) {
        if (_ref.ok && _ref.body.ok) {
          var data = _ref.body.form;
          state.tabs = (data && data.tabs) ? data.tabs : [];
          walkState(state);
          if (msg) {
            msg.className = "fb-msg ok";
            msg.textContent = "Saved.";
          }
          render();
        } else {
          throw new Error((_ref.body && _ref.body.error) || "Save failed");
        }
      })
      .catch(function (e) {
        if (msg) {
          msg.className = "fb-msg err";
          msg.textContent = e.message || String(e);
        }
      });
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(stripKeysForApi({ tabs: state.tabs }), null, 2)], {
      type: "application/json",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "form-" + formId + "-structure.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        pushHistorySnapshot();
        var j = JSON.parse(r.result);
        state.tabs = j.tabs || [];
        walkState(state);
        render();
      } catch (e) {
        alert("Invalid JSON: " + e.message);
      }
    };
    r.readAsText(file);
  }

  window.FormBuilderInit = function (opts) {
    formId = opts.formId;
    apiUrl = opts.apiUrl;
    var init = opts.initial || {};
    state = { tabs: init.tabs ? init.tabs.slice() : [] };
    walkState(state);

    document.getElementById("fb-add-tab") &&
      document.getElementById("fb-add-tab").addEventListener("click", addTab);

    document.getElementById("fb-add-section-last") &&
      document.getElementById("fb-add-section-last").addEventListener("click", function () {
        if (!state.tabs.length) {
          addTab();
          return;
        }
        invalidateSelectionIfStale();
        var r = resolveSelectedIndices();
        var ti =
          r && selected
            ? r.ti
            : state.tabs.length - 1;
        addSection(ti);
      });

    document.querySelectorAll("[data-fb-field-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ft = btn.getAttribute("data-fb-field-type");
        addFieldFromPalette(ft);
      });
    });

    document.getElementById("fb-save") &&
      document.getElementById("fb-save").addEventListener("click", save);
    document.getElementById("fb-export") &&
      document.getElementById("fb-export").addEventListener("click", exportJson);
    document.getElementById("fb-undo") &&
      document.getElementById("fb-undo").addEventListener("click", undo);
    var imp = document.getElementById("fb-import");
    if (imp) {
      imp.addEventListener("change", function () {
        if (imp.files && imp.files[0]) importJson(imp.files[0]);
        imp.value = "";
      });
    }

    render();
  };
})();
