# Oracle exploration — musing out loud, not a spec

A design conversation Les had with Gemini in September 2026, before this repo
existed and before BotKit's constraints were known. Preserved verbatim, minus
the private conversation URL.

> [!IMPORTANT]
> **This is thinking out loud, and all of it is open to change on feasibility
> grounds — including the mechanic itself.**
>
> Read past the register. The document titles itself "Specification: Fediverse
> Oracle Protocol (FOP-01)" and uses RFC-style **MUST** / **MUST NOT**, which
> reads far more settled than it is. That is the model's voice, not a decision
> Les made. Nothing here has been ratified, costed, or checked against what
> BotKit can actually do.
>
> Treat every element as a proposal to argue with. Several are already known to
> be unbuildable as written — see
> [*oracle-design-notes.md*](oracle-design-notes.md), which records what
> survives contact with the framework, what does not, and what is simply
> obsolete. Do not implement from this document alone.

Its value is as the fullest statement of what the Oracle is *for*, and of the
flavour Les is after. The mechanics are negotiable; the spirit is the point.

---

*User prompt: I'm musing about a project I'm calling the Fediverse Oracle. Inspired by the Usenet Oracle. Folks can at-mention a bot to ask a question. In response, the bot DMs the querent to ask them to answer someone else's question. When they answer, the bot posts the answer as if it were answering that other person's question.*

Response: That concept is a brilliant adaptation of the classical Usenet Oracle (later the Internet Oracle) mechanism for decentralized social networks. By leveraging ActivityPub / Fediverse primitives, you solve several logistical hurdles the original email-based Oracle had to hack together via custom SMTP parsers.

Here is an architectural and mechanical breakdown of how the **Fediverse Oracle** translates to modern decentralized paradigms, along with structural edge cases you will need to account for.

### **Core Data Flow & State Machine**

   `[User A]                    [Fediverse Oracle Bot]                     [User B]`  
      `|                                   |                                  |`  
      `|--- 1. Public @Mention Question -->|                                  |`  
      `|    ("Oracle: What is sleep?")     |                                  |`  
      `|                                   |--- 2. Direct Message Request --->|`  
      `|                                   |    ("To receive your answer,     |`  
      `|                                   |     first answer: Why is sky?")  |`  
      `|                                   |                                  |`  
      `|                                   |<-- 3. Direct Message Reply ------|`  
      `|                                   |    ("Because Rayleigh scatter")  |`  
      `|                                   |                                  |`  
      `|<-- 4. Public Reply / Thread ------|                                  |`  
      `|    ("Rayleigh scattering...")     |                                  |`

> 1. **Ingestion (The Sacrifice):** User A creates a public post mentioning @oracle@domain.  
> 2. **Matching & Queueing:** The Oracle queues User A's question (*QA*​). It pulls an unassigned prior question (*Q*0​) from the database and holds *QA*​ until someone else asks a question.  
> 3. **Assignment (The Task):** The Oracle sends a Direct Message (ActivityPub private addressing) to User A: *"To receive the answer to your question, you must first answer this query from a seeker: \[Question Q0​\]"*.  
> 4. **Resolution & Publication:** When User A replies to the DM with an answer (*A*0​), the Oracle:  
   * Publishes *A*0​ as a public thread reply to *Q*0​'s original poster.  
   * Marks *Q*0​ as resolved.  
   * Releases *QA*​ into the queue to be dispatched to User B.

### **ActivityPub & Protocol Mapping**

> * **Inbound Listening:** Use an actor WebSocket stream (e.g., Mastodon Streaming API or raw ActivityPub Inbox monitoring) filtered for Note objects containing your actor's attributedTo / @-handle.  
> * **Addressing & Visibility:**  
  * **Public Ingestion:** to: \["\[https://www.w3.org/ns/activitystreams\#Public\](https://www.w3.org/ns/activitystreams\#Public)"\], cc: \[actor\_followers, user\_uri\].  
  * **Private Assignment (DM):** to: \[user\_uri\], strictly excluding the Public collection to ensure context isolation.  
  * **Oracle Answer Output:** to: \["\[https://www.w3.org/ns/activitystreams\#Public\](https://www.w3.org/ns/activitystreams\#Public)"\], inReplyTo: original\_question\_object\_id.  
> * **Identity Attribution:** The Usenet Oracle traditionally prefixed responses with standard headers (*"The Oracularity has pondered your question..."*). In ActivityPub, maintaining the Bot's actor profile for all published answers retains the core gag while respecting protocol specs.

### **Key Technical & Mechanical Challenges**

**1\. Queue Starvation & Stale Locks**

> * *Problem:* User A asks a question, receives a DM assigned *Q*0​, and abandons the conversation. *Q*0​ is now stuck in an unfulfilled state, and User A's question *QA*​ never enters the active pool.  
> * *Mitigation:* Implement a TTL (Time-To-Live) on assignments (e.g., 24 hours). If User A does not answer *Q*0​, re-queue *Q*0​ for the next seeker and expire User A's pending query ticket.

**2\. Asynchronous Bootstrapping (The Cold Start)**

> * *Problem:* The system requires *N*\+1 participants to function. The first user to ask a question has no prior question to answer.  
> * *Mitigation:* Pre-seed the system with a pool of synthetic/historical Oracular questions (or classic Usenet Oracle archive entries) to seed *Q*0​.

**3\. Content Moderation & Abuse Vectors**

> * *Problem:* The Fediverse is decentralized, but instances federate based on trust. If User A replies to the Oracle with severe policy-violating content (CSAM, hate speech, spam), the Oracle bot will inadvertently publish it under its own identity.  
> * *Mitigation:*  
  * **Automated Filtering:** Pass DM replies through string/regex checks and automated LLM moderation classifiers before publishing to the public thread.  
  * **Instance Domain Blocks:** Implement an internal blocklist for known bad-actor instances.  
  * **Human-in-the-Loop Approval (Optional Flag):** Allow an admin interface to approve pending answers before the bot posts them publicly.

**4\. Context Leakage**

> * *Problem:* Mastodon and other Fediverse software handle DMs as "mentioned-only visibility." If a user accidentally includes another handle or changes the visibility settings on their DM reply, the privacy of the pair assignment breaks.  
> * *Mitigation:* Explicitly strip incoming tags, mentions, and tracking metadata from the payload before mapping the reply string *Ax*​ to question *Qx*​.

### **Database Schema Draft (Relational)**

| Table | Column | Type | Description |
| :---- | :---- | :---- | :---- |
| **questions** | id | UUID | Primary Key |
|  | author\_ap\_id | Text | Full Actor URI of the querent |
|  | question\_post\_uri | Text | Object URI of the original public post |
|  | question\_text | Text | Cleaned text of the question |
|  | status | Enum | PENDING, ASSIGNED, ANSWERED, EXPIRED |
| **assignments** | id | UUID | Primary Key |
|  | question\_id | Foreign Key | References questions(id) |
|  | assigned\_user\_ap\_id | Text | Actor URI expected to answer |
|  | assigned\_at | Timestamp | Start time for TTL calculation |
|  | answer\_text | Text | Stored response once received |

---

*User prompt: Let's think some more through the specific user experience and interaction patterns here. Fediverse public posts and DMs are essentially the UI*

Response: Because Fediverse interactions depend entirely on standard ActivityPub client behavior, treating the post timeline and DM thread as your primary interface requires careful design. Clients vary wildly (Mastodon, Misskey, Pixelfed, Phanpy), so your UI logic must rely exclusively on universal primitives: mention semantics, post visibility, and formatting conventions.

### **End-to-End User Experience Lifecycle**

`[Phase 1: Seeker]                  [Phase 2: Oracle Intermediary]               [Phase 3: Answerer]`  
`User posts public @mention  ───>  Oracle sends Direct Note w/ Prompt  ───>  User replies directly in DM`  
                                                                                          `│`  
`[Phase 5: Notification]            [Phase 4: Public Delivery]                            │`  
`User gets tagged in public answer  <───  Oracle posts public reply to original thread  <──┘`

#### **Phase 1: The Sacrifice (Public Inquiry)**

> * **User Action:** The user (Seeker) posts a public status:  
>   @oracle@example.com Oh great Oracle, why do hot dogs come in packages of 10 while buns come in packages of 8?  
> * **Bot Behavior:**  
  1. Captures the post payload, extracts the raw text body, and strips the bot's @mention.  
  2. Parses optional Oracular flavor headers if present (e.g., standardizing "Oh Great Oracle...").  
  3. Immediately sends an in-app "Favorite" or "Bookmark" reaction to the post to visually acknowledge receipt on the user's timeline.

#### **Phase 2: The Oracular Trial (The DM Assignment)**

> * **Bot Action:** The bot dispatches a Direct Message (visibility: direct / mentioned-only) back to the Seeker:  
>   `Your question has been received by the Oracularity.` 

>   `Before the gods grant your wisdom, you must answer this query from another humble seeker:`

>   `"Why does my cat stare at the empty corner of the ceiling at 3 AM?"`

>   `(Reply directly to this message with your answer to complete your task.)`

> * **UI Considerations:**  
  * **Threading Context:** The DM should **not** be in-reply-to the original public post. It must originate as a standalone direct conversation to prevent cross-posting visibility leaks in poorly optimized clients.  
  * **Clear Guidance:** Because Fediverse users aren't used to conversational state machines in DMs, the prompt must explicitly state: *Reply directly to this message*.

#### **Phase 3: The Ritual (The User's Answer)**

> * **User Action:** The Seeker replies within the DM thread:  
>   They are monitoring dimensions we lack the senses to perceive.  
> * **Bot Behavior:**  
  1. Validates that the reply comes from the expected attributedTo actor URI within the TTL window.  
  2. Extracts the text, strips any client-injected @oracle handles, and stores it as *Apending*​.  
  3. Responds in the DM to confirm completion:  
     `Your wisdom has been recorded and dispatched across the ether.`   
     `The Oracle is now contemplating your own question...`

#### **Phase 4: The Epiphany (Public Revelation)**

> * **Bot Action:** The bot resolves the question *Qprior*​ asked by a previous user (Seeker B) by publishing a **Public Reply** attached directly to Seeker B's original thread.  
> * **Post Layout:**  
>   `The Oracle has pondered your question.`

>   `"They are monitoring dimensions we lack the senses to perceive."`

>   `---`  
>   `(Transmitted via a wise seeker on the network.)`

> * **UI/UX Dynamics:**  
  * **In-Thread Context:** By making this a public inReplyTo pointing to the original post, anyone following the original thread sees the answer appear naturally in their feed.  
  * **Anonymity vs. Attribution:** The Usenet Oracle preserved strict anonymity. In Fediverse terms, you should omit the actual author's @handle in the public post body to prevent cross-user target harassment or back-and-forth thread derailment, maintaining the fiction that the *Oracle* is speaking.

### **Handling Edge Cases in the Client Interface**

| Scenario | UX Challenge | Recommended Pattern / Solution |
| :---- | :---- | :---- |
| **User replies publicly instead of in DM** | The answer to another user's question leaks into the public stream prematurely. | Detect if incoming text from assigned user is public/unlisted instead of direct. If so, auto-delete/ignore, and send a DM reminder: *"Please reply to the private message, not in public."* |
| **User asks a new question while an assignment is active** | Dual-state confusion; user gets trapped in nested loops. | Reject the new question via DM: *"You currently have a pending task. Answer your assigned query first before seeking further wisdom."* |
| **Multilingual Querents** | User A asks in German; assigned a English question. | Parse incoming posts using ActivityPub language fields (or simple language-detection flags) to match questions and tasks in the same language code. |
| **Formatting Artifacts** | Rich text (HTML, Markdown, Custom Emojis) breaks formatting across instances. | Sanitize incoming HTML into plain text before re-wrapping into outbox payloads. Replace instance-specific custom emojis (e.g., :blobcat:) with shortcodes or drop them to prevent broken rendering elsewhere. |

---

*User prompt: I'm also thinking maybe we should require certain ceremonial formulations, like require "oh great oracle" as a preface to better filter for intentional requests versus casual replies*

Response: Requiring a formal invocation is a classic Usenet Oracle tradition, and from an engineering perspective, it solves several critical client-level UX edge cases on the Fediverse.

Without a trigger phrase, any public @mention (like someone replying to a thread saying *"Hey @oracle, what do you think?"*) risks accidentally firing the state machine. Enforcing ritualistic syntax acts as an explicit confirmation of intent.

### **Ingestion Validation & Strict Ritual Syntax**

To enforce the ritual without making the regex brittle, match against standard invocation patterns at the start of the sanitized body string.

`Regex: ^(?i)\s*(oh\s+)?(great|mighty|wise|omniscient)?\s*oracle[,:\s]+(?P<question>.+)`

`[Incoming Public Post]`  
       `│`  
       `▼`  
`Contains @oracle tag? ──No──► [Ignore]`  
       `│ Yes`  
       `▼`  
`Matches Invocation Pattern? ──No──► [Send "Improper Sacrifice" DM / Ignore]`  
       `│ Yes`  
       `▼`  
`Extract <question> payload & begin Queue State Machine`

#### **Valid Invocations**

> * "Oh great oracle, why do we park on driveways and drive on parkways?"  
> * "Oracle: Will it rain in Portland tomorrow?"  
> * "Oh Wise Oracle \- What is the velocity of an unladen swallow?"

### **UX Workflows for Invalid Invocations**

When someone tags @oracle without the required ceremony, you have two design options:

**1\. Passive Ignorance (Silent Fail)**

> * **Behavior:** The bot does absolutely nothing.  
> * **Pros:** Zero noise, completely avoids spam loops, and mimics an unawakened deity ignoring an unworthy prayer.  
> * **Cons:** First-time users might assume the bot is dead or broken.

**2\. The "Improper Sacrifice" Response (Active Guidance)**

> * **Behavior:** The bot sends a direct message (or a auto-expiring single notification) explaining the missed ritual.  
> * **Template:**  
>   `The Oracularity remains silent. Your voice was lost in the ether.`

>   `If you seek wisdom, you must address the Oracle properly.`   
>   `Begin your public invocation with: "Oh great Oracle..."`

> * **Pros:** Teaches the user the interaction model without cluttering public threads.

### **Expanding the Ritual Arc: Reciprocal Pomp**

If the user must adhere to ceremonial syntax to *ask*, the Oracle should enforce reciprocal ritualism when delivering tasks and answers.

> * **The Duty Assignment DM:**  
>   `Your supplication has reached the Temple, but the scales require balance.`

>   `Before the Oracularity reveals your answer, a fellow seeker requires your insight. Answer this query:`

>   `"Why is the sky blue?"`

> * **The Final Published Answer:**  
>   `The Oracle has pondered your question.`

>   `"Because Rayleigh scattering deflects shorter wavelengths of light."`

>   `---`  
>   `Thus answereth the Oracularity.`

### **Practical Benefits of Mandatory Ceremonial Syntax**

> * **Accidental Loop Prevention:** Prevents the bot from getting caught in multi-user reply chains where people keep tagging @oracle while discussing something else.  
> * **State Machine Guardrails:** Ensures that only posts explicitly meant to open a new transaction pipeline enter the questions database.  
> * **Community Culture & Flavor:** The friction *is* the feature. Requiring users to roleplay slightly sets the tone, filters out low-effort bot spam, and builds a shared lore unique to your Fediverse instance.

---

*User prompt: Let's think this through some more and maybe produce a semi-formal spec. I think the ritual ceremony can be a bit of a noise filter*

Response: A formal requirement for ceremonial framing acts as both a functional noise filter and a cultural framing device. On open protocols like ActivityPub, requiring explicit invocation syntax prevents accidental triggers from natural conversation, thread mentions, or automated bots.

Here is a semi-formal specification for the **Fediverse Oracle Protocol & State Machine (v0.1)**.

# **Specification: Fediverse Oracle Protocol (FOP-01)**

## **1\. System Overview**

The Fediverse Oracle is a stateful, asynchronous reciprocal-answering bot. It receives public queries from network actors, queues them, and conditions the delivery of an answer on the requester answering an unfulfilled query from another actor.

## **2\. Invocation & Syntax Rules (The Ritual Filter)**

### **2.1 Ingestion Gate**

An incoming ActivityPub Note is evaluated for processing **only** if it satisfies all three conditions:

> 1. The Note explicitly mentions the Oracle actor's URI in tag array.  
> 2. The Note has public visibility (\[https://www.w3.org/ns/activitystreams\#Public\](https://www.w3.org/ns/activitystreams\#Public) in to or cc).  
> 3. The stripped text content matches the **Invocation Grammar**.

### **2.2 Invocation Grammar (EBNF)**

`Invocation       ::= Phrase Separator Query ;`  
`Phrase           ::= [ "Oh" ] [ Adjective ] "Oracle" ;`  
`Adjective        ::= "great" | "mighty" | "wise" | "omniscient" | "all-knowing" | "venerable" ;`  
`Separator        ::= "," | ":" | "-" | "—" | "\n" | " " ;`  
`Query            ::= { any printable character } ;`

*Regex Matcher:*

`^(?i)\s*(?:oh\s+)?(?:great|mighty|wise|omniscient|all-knowing|venerable)?\s*oracle\b[,:\-\s\n]+(?P<query>.+)`

### **2.3 Non-Conforming Public Mentions**

If a public Note mentions the Oracle but fails the Invocation Grammar:

> * The system **MUST NOT** enqueue a new question.  
> * The system **MUST NOT** send a public reply.  
> * The system **MAY** drop the event silently (default) OR send a single private direct message containing the invocation error template.

## **3\. Core State Machine**

              `┌────────────────────────────────────────────────────────┐`  
              `│                                                        │`  
              `▼                                                        │`  
`┌──────────────────────────┐     Match Invocation     ┌────────────────┴─────────┐`  
`│  Inbound Public Mention  ├─────────────────────────►│ Enqueue Question (Q_new) │`  
`└──────────────────────────┘                          └────────────┬─────────────┘`  
                                                                   `│`  
                                                                   `▼`  
`┌──────────────────────────┐    Assign Pending Q_prior┌──────────────────────────┐`  
`│  Send Confirmation DM    │◄─────────────────────────┤  Pull Unassigned Q_prior │`  
`│  w/ Task Prompt (Q_prior)│                          └──────────────────────────┘`  
`└────────────┬─────────────┘`  
             `│`  
             `├──────────────────────────┐ (TTL Expiry / Timeout)`  
             `▼                          ▼`  
`┌──────────────────────────┐  ┌──────────────────────────┐`  
`│ Wait for DM Reply (A_pri)│  │ Reset Q_prior -> PENDING │`  
`└────────────┬─────────────┘  │ Mark Seeker -> EXPIRED   │`  
             `│                └──────────────────────────┘`  
             `▼`  
`┌──────────────────────────┐`  
`│ Validate & Store A_prior │`  
`└────────────┬─────────────┘`  
             `│`  
             `▼`  
`┌──────────────────────────┐`  
`│ Publish Public Answer    │`  
`│ to Q_prior's Thread      │`  
`└──────────────────────────┘`

### **3.1 State Transitions**

| Current State | Event | Next State | Action |
| :---- | :---- | :---- | :---- |
| IDLE | Public Mention with valid Invocation | ENQUEUED | Store *Qnew*​, fetch unassigned *Qprior*​. |
| ENQUEUED | *Qprior*​ available | ASSIGNED | Send Task Assignment DM to Seeker. Set *TTL*\=*t*\+24h. |
| ENQUEUED | No *Qprior*​ available | WAITING\_POOL | Hold *Qnew*​ in queue until another Seeker invokes system. |
| ASSIGNED | Valid DM Reply received (*Aprior*​) | RESOLVED | Publish *Aprior*​ to *Qprior*​ thread. Mark *Qnew*​ as PENDING\_ASSIGNMENT. |
| ASSIGNED | Clock exceeds *TTL* | EXPIRED | Reset *Qprior*​ status to PENDING. Notify Seeker via DM of expired task. |

## **4\. Message Design & Formatting Standards**

### **4.1 Direct Message Assignment (The Task)**

> * **Visibility:** direct / mentioned-only (strictly restricted to the Seeker's actor URI).  
> * **Payload Structure:**  
>   `The Oracularity has received your supplication.` 

>   `Before your answer can be revealed, balance must be restored to the ether. You must provide counsel for another seeker:`

>   `"[{Q_prior_text}]"`

>   `Reply directly to this message with your answer.`

### **4.2 Public Answer Resolution (The Revelation)**

> * **Visibility:** public (to: \["\[https://www.w3.org/ns/activitystreams\#Public\](https://www.w3.org/ns/activitystreams\#Public)"\]).  
> * **Targeting:** inReplyTo set to original *Qprior*​ post ID.  
> * **Payload Structure:**  
>   `The Oracle has pondered your question.`

>   `"{A_prior_text}"`

>   `---`  
>   `Thus answereth the Oracularity.`

## **5\. Security, Isolation & Content Safety**

> 1. **Mention Stripping:** The system must strip all @handle mentions from incoming *Q* and *A* strings before saving or re-posting to prevent notification amplification attacks.  
> 2. **Context Isolation:** Incoming DM replies must **never** inherit the inReplyTo ID of the public post to prevent private messages from leaking into public thread graphs via misconfigured instances.  
> 3. **Anonymity Preservation:** The public answer post **MUST NOT** tag, credit, or link to the actor URI of the user who wrote the answer (*A*). The answer is presented strictly as the voice of the Oracle.  
> 4. **Sanitization:** All inputs must be stripped of raw HTML and custom instance shortcodes before being queued.

---

*User prompt: Are there other ways we can try to preserve the flow of the "game" while expecting semi random messages and spam?*

Response: Because open networks like the Fediverse suffer from unpredictable traffic, bot spam, and abandoned DMs, relying strictly on a rigid 1-to-1 sequential queue will break the flow of the game.

To keep the game moving smoothly without getting stuck or overwhelmed by junk, you can implement several structural mechanisms:

### **Queue Mechanics & Asynchronous Flow**

> * **Pool-Based Assignment (Over-Dispatch):**  
  * Rather than assigning a single question *Q*0​ to one person and waiting, pool unanswered questions into an active deck.  
  * When User A asks a question, assign them a question randomly sampled from the top *K* oldest questions in the pool. Multiple users might temporarily be asked to answer the same *Q*0​.  
  * Whichever user answers first resolves *Q*0​ for its original asker; subsequent answers to *Q*0​ can either be stored as alternate Oracular interpretations or discarded safely.  
> * **Synthetic "God-of-the-Machine" Buffers:**  
  * To prevent new askers from waiting days for a human response if traffic drops, set a hard timeout (e.g., 2 hours).  
  * If no human seeker has answered User A's question within the window, the system falls back to a seed pool of classic Usenet Oracle responses, an LLM-generated Oracular response, or canned cryptic wisdom to fulfill the loop.  
> * **Dynamic TTL & Decay:**  
  * Keep assignment windows short (e.g., 30 to 60 minutes).  
  * If a user doesn't reply in their DM within 45 minutes, silently reassign that target question to another active participant without penalty. If the original user eventually replies late, treat their answer as a fresh submission or drop it gracefully.

### **Spam & Junk Handling**

| Problem | Structural Solution |
| :---- | :---- |
| **Low-Effort / Keyboard-Smash Answers** ("asdf", "idk", "no") | **Length & Entropy Thresholds:** Enforce min/max character counts (e.g., 15–500 characters) and simple dictionary/entropy checks on DM replies before accepting them as valid sacrifices. |
| **Bot Accounts & Automated Invocation** | **Proof-of-Work / Challenge-Response:** Require the user's initial invocation post to include an additional random ceremonial element if automated bot accounts spam the trigger (e.g., *"Oh great Oracle, accept my sacrifice of \[random noun\]"*). |
| **Out-of-Order or Multi-Question Users** | **Single Active Ticket Per Actor:** Restrict an actor URI to one pending question at a time. If they post @oracle again while holding an open DM task, simply resend their active DM prompt rather than creating a new queue entry. |

### **Game-Design Incentives & Flavor**

> * **"Favor of the Gods" (Karma / Reputation):**  
  * Track an internal, invisible quality score for users based on whether their answers are well-received (e.g., original thread askers favoriting the Oracle's reply).  
  * High-scoring users get their own questions pushed to the top of the assignment deck, receiving answers faster.  
> * **Oracular Rejection (Flavorful Moderation Filters):**  
  * If a submission fails automated content moderation, length checks, or ritual syntax, don't just ignore it. Have the bot reply in DM with themed rejections:  
    * *"The Oracularity finds your sacrifice lacking in substance. Speak with greater conviction."* (Too short)  
    * *"The divine fumes obscure your words. Try your prayer again."* (Failed ritual match)

---

