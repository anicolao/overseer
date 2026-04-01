# MVP Remediation 4: Identity & Contextual Linking

Testing has revealed that bots have lost their clear identity reporting, and their responses are often disconnected from the specific comments they are addressing. This remediation plan restores and enhances persona attribution and linking.

## 1. Identified Issues

### A. Lost Identity (Attribution)
The "I am the [Persona]" header was removed or simplified, making it hard to track which model wrote which comment, especially since all bots share the same GitHub username.

### B. Contextual Disconnection
Bots respond to the issue as a whole, but they don't explicitly link back to the specific comment or person that triggered them. This makes it difficult to follow the thread of conversation in busy issues.

### C. Attribution Inaccuracy
Current attribution uses the GitHub login (e.g., `anicolao`), which is the same for both humans and bots in the MVP. It does not distinguish between a human mention and a bot delegation.

## 2. Proposed Structural Improvements

### 1. Enhanced Attribution Logic
Update `PersonaHelper.getAttribution` to handle:
- **Responder Persona:** Parse the target comment's body to identify if it was written by another bot (e.g., "I am responding to a comment from the Architect").
- **Deep Linking:** Include a Markdown link directly to the comment URL being addressed.

### 2. Dispatcher Data Enrichment
The Dispatcher will be updated to:
- Identify the persona of the *sender* if the sender is a bot (by parsing the comment body).
- Pass the `commentUrl` to the persona handler.

### 3. Standardized Header
Every bot response will start with a standardized, hyperlinked header:
> I am the **[Persona]**, responding to **[this comment]** from **[Human/Persona]**.

## 3. Technical Tasks

1.  **Refactor `PersonaHelper.getAttribution`:**
    *   Add `respondingToUrl` and `respondingToPersona` parameters.
    *   Generate a rich, linked header.
2.  **Update `dispatch.ts`:**
    *   Parse the triggering comment body to identify the sender's persona.
    *   Capture `html_url` from the GitHub event payload.
    *   Pass these to the persona's `handleComment`/`handleMention` methods.
3.  **Update Personas:**
    *   Pass the new metadata through to the attribution helper.

## 4. Success Criteria
- Every bot comment clearly states who it is and who/what it is responding to.
- Every bot response contains a direct link to the triggering comment.
- The conversation history is easy to follow, even when multiple agents are involved.
