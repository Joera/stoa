# What Pi 1.0 means for Stoa

Synthesis of the Earendil post "Pi 1.0" (2026-10-01, earendil.com/posts/pi-1-0/), read against `idea.md`. The post announces two things at once: the Pi 1.0 agent harness, and a new experimental package, **Pi Durable**, which is exactly the engine Stoa's "Built on" section names.

## What the post says

**Pi 1.0** is a hardened, minimal, extensible agent harness "that you can make your own." Hundreds of thousands of people use Pi weekly; the 1.0 release is the result of months of feedback-driven hardening into software "people and businesses can depend on."

**Minimalism is a discipline.** Pi's stated process: wait until something has proven itself before adopting it, weighing true functionality against inherent added complexity. "The list of things that fell off the wall is much longer" than the list that stuck.

**What shipped in 1.0:**
- **Codemode** — native support for MCP, plus non-LLM models (Jev, image models).
- **Extension support for virtual models** — routing: e.g. plan with Claude Opus, implement with GPT, with a decider model choosing when to switch (`router/auto`).
- **Deferred tool loading.**
- **Cache warming** for Anthropic models.
- **Mid-conversation system messages** — transcript-aware prompt and tool changes.
- A new TUI theme; full-screen mode by default.

**Pi Durable** is a separate experimental substrate for building *long-running agentic applications* — bringing Pi's minimalism and supermalleability "outside the coding agent and outside the terminal," reachable from different surfaces, supporting longer-running conversations and tasks, letting builders *and users* "wield and steer the underlying intelligence with tremendous dexterity."

**Mission and licensing:** Earendil exists to "craft software and open protocols that strengthen human agency." Both packages are MIT-licensed. Pi Durable ships as `npm install @earendil-works/pi-durable @earendil-works/pi-ai @earendil-works/chord`.

## Applicable to Stoa

**The engine the idea depends on is real and shipping.** `idea.md` builds on Pi Durable; this post confirms it exists as an MIT-licensed npm package (`pi-durable`, `pi-ai`, `chord`), explicitly aimed at long-running agentic applications reachable from non-terminal surfaces — not a hope, but an installable substrate. The room-as-conversation model (rooms, forks for side conversations, crash recovery, live multi-person viewing, long-running history) is precisely the "long-running agentic application" Pi Durable targets.

**"Steer the underlying intelligence with dexterity" is the Stoa UX.** The post frames Pi Durable's goal as letting users steer the agent, not just builders. That matches Stoa's live, multi-person questioning: everyone present steers the shared agent, joins late without losing the thread. Pi Durable is described as delivering exactly that; Stoa is a concrete instance.

**Contribution rules map onto tools and hooks.** `idea.md` says rules are enforced in code "through tools and hooks." Pi 1.0's Codemode (native MCP) plus mid-conversation system messages (transcript-aware prompt and tool changes) give the enforcement mechanism: per-query, the room can attach/swap the tool that encodes a contribution's rules (who may query, quote-only, combinable, expiry), with no reliance on the model "behaving." Deferred tool loading means a room loads only the rules relevant to the current question — enforcement without loading every contribution's machinery.

**Neutrality via model routing.** Pi 1.0's virtual-model routing (a decider picks which model runs what) is a direct building block for Stoa's privacy stance: route queries to private inference or local models where needed, so "the model provider doesn't become the owner." The same mechanism can route by cost (cache-warmed Anthropic for heavy synthesis, local for sensitive material).

**Non-LLM models widen the material a room can question.** Codemode's support for image models and Jev matters for archives and journalism: scans, photos, and other non-text material can be questioned in the same room, not just prose.

**Cost and latency for many users.** Cache warming and deferred tool loading are the kinds of features a room with many simultaneous questioners needs to stay cheap and responsive — relevant to the "many people contribute and question" core.

**A stable base for a public thing.** Stoa's first concrete use is a widget under news articles, i.e. a public, many-user surface. Pi 1.0 is hardened, dependable, and MIT-licensed — a reasonable foundation for something strangers rely on, and self-hostable in line with Stoa's neutrality.

**A design principle to inherit: minimalism as discipline.** Stoa should adopt features only after they prove themselves, and keep the room core thin — the value is in the room's rules and portability, not a feature pile. The "fell off the wall" list is a design attitude worth writing into Stoa's own ethos.

## Open questions this raises (adds to `idea.md`)

- Which Pi Durable primitives map 1:1 to rooms vs. which Stoa must build above it (live multi-person viewing, contribution tool injection) — the post points to a separate "how we crafted Pi Durable" article for detail; worth reading before committing the "Built on" section.
- Whether contribution rules as MCP tools are a clean fit, or whether Stoa needs its own hook layer on top of Pi's.

## Sources

- Earendil, "Pi 1.0", 2026-10-01: https://earendil.com/posts/pi-1-0/
- Related (linked from the post, not yet read): the "Codemode and MCP" post from the same week; Mario's deeper post on crafting Pi Durable; pi.dev docs.
