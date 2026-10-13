// Questions to bring: the section under the plan. 2026-10-13.
import { questionsText, whenLabel, type QuestionItem } from "../../../core/questions";
import { el, esc } from "./html";

const WHY: Record<QuestionItem["why"], string> = { kindred: "kindred spirit", opponent: "worthy opponent", serendipity: "serendipity", plan: "in your week" };

export function renderQuestions(root: HTMLElement, items: QuestionItem[], copy: (text: string) => void): void {
  if (items.length === 0) { root.replaceChildren(); return; }
  const days = [...new Set(items.map((it) => it.slot?.day ?? ""))];
  const dayTitle = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "Not yet scheduled");
  const html = days.map((day) => `<h3>${esc(dayTitle(day))}</h3>` + items.filter((it) => (it.slot?.day ?? "") === day).map((it) => `
    <div class="question" data-testid="question" data-why="${it.why}">
      <p class="who"><strong>${esc(it.doc.name)}</strong> <span class="why-tag">${WHY[it.why]}</span></p>
      <p class="qtitle"><a href="${esc(it.doc.url)}" target="_blank" rel="noopener">${esc(it.doc.title)}</a></p>
      <p class="when">${esc(whenLabel(it))}</p>
      <p class="ask"><span>Ask:</span> ${esc(it.doc.askQuestion)}</p>
      <p class="ask push"><span>Push back:</span> ${esc(it.doc.challengeQuestion)}</p>
    </div>`).join("")).join("");
  const node = el(`<section class="questions" data-testid="questions"><h2>Questions to bring</h2>
    <p class="blurb">One friendly question and one skeptic's question for each presenter you're likely to hear, in schedule order. Drafted from the abstracts; read the abstract before you use one.</p>
    ${html}
    <p class="actions"><button type="button" id="copy-questions">Copy as text</button> <span id="copied" role="status"></span></p>
  </section>`);
  node.querySelector("#copy-questions")!.addEventListener("click", () => {
    copy(questionsText(items));
    const s = node.querySelector("#copied")!; s.textContent = "Copied"; setTimeout(() => { s.textContent = ""; }, 2000);
  });
  root.replaceChildren(node);
}
