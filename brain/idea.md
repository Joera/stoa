Stoa (working name): a neutral room where people bring knowledge together and question it with an AI, without anyone owning the room.

### The problem

Knowledge sits in scattered bodies of material (research, archives, data, notes) that others can't question.
Sharing is all-or-nothing: hand over raw material, or keep it closed.
Conversations about knowledge scatter across chats and comments, and never build up.
AI tools for working with documents are mostly single-player.
Doing this together today means putting your material on someone else's platform, which sees it and sets the rules.

### The idea

A Stoa is a room where many people contribute material and question it together through a shared AI agent.
Nobody owns the room. Contributors own their contributions; the room only enforces what they decided.
Questions and answers build up over time, visible to the room, with private side conversations when needed.
Everyone present sees answers stream in live, can steer the agent, and can join late without losing the thread.

### Contributions

Each contribution carries its contributor's rules: who may query it, quote or summarize only, combinable with other material or not, and when it expires.
Rules are enforced in code on every retrieval, not by asking the AI to behave.
Contributors can revoke access and can see how their material is used.
Every answer records which contributions it drew on.

### Neutrality

Open source and self-hostable; no central service anyone depends on.
Hosted rooms run in confidential compute (e.g. nilCC): the operator can't see inside, and attestation proves the published code is what's running.
Contributions are encrypted, with keys released only inside the enclave.
Model calls stay private where needed (private inference or local models), so the model provider doesn't become the owner.
Storage and code are portable, so a room can move between hosts.

### Uses

Journalism: a widget under an article, where readers and members question the research behind it. The first concrete implementation.
Researchers opening the data behind a paper.
Newsrooms collaborating on an investigation without pooling raw files.
Public consultations over policy documents.
Community, family, or institutional archives.

### Built on

Pi Durable as the engine: rooms as conversations, side conversations as forks, crash recovery, live multi-person viewing, long-running history.
Contribution rules enforced through tools and hooks.
Browser connected via Server-Sent Events plus POST, or WebSocket.

### Open questions

Governance: who admits members and changes room-wide rules, with no owner?
Revocation vs. history: what happens to past answers when material is withdrawn?
Combination leaks: how to stop harmless pieces from revealing something together?
Bad contributions: how to flag or quarantine material designed to manipulate the agent?
Name: test whether "Stoa" reads as a place or as Stoicism.

I can also turn this into a shareable doc if you want to pass it around.