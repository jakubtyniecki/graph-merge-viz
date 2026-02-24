# Merge Strategies

Merge strategies define how data is transferred between panels when a merge button is clicked. They control whether existing elements in the target panel are preserved, updated, or deleted.

## Overview

A merge operation involves a **Source** panel and a **Target** panel. The strategy determines how the target's graph state is modified to match the source's graph state. Strategies are configured via the settings (⚙) icon in the merge management modal.

## Mirror

The **Mirror** strategy performs a full replacement of the target graph. The target becomes an exact copy of the source graph.

- **Deletions:** Any nodes or edges present in the target but absent from the source are deleted.
- **Updates:** Properties of existing elements in the target are overwritten by the source.
- **Use Case:** Completely resetting a downstream panel to match an upstream "source of truth."

**Example:**
- **Before:**
    - Target: Nodes `{A, B}`
    - Source: Nodes `{B, C}`
- **After:**
    - Target: Nodes `{B, C}` (Node `A` was deleted because it did not exist in the source).

## Push

The **Push** strategy is an additive merge. It brings in new elements and updates existing ones, but never deletes anything from the target.

- **Deletions:** None. Existing elements in the target are always preserved.
- **Updates:** Properties of nodes/edges with matching IDs are updated to match the source.
- **Use Case:** Accumulating changes from multiple source panels into a single aggregate panel.

**Example:**
- **Before:**
    - Target: Nodes `{A, B}`
    - Source: Nodes `{B, C}`
- **After:**
    - Target: Nodes `{A, B, C}` (Node `A` is preserved; Node `C` is added; Node `B` is updated).

## Scoped

The **Scoped** strategy acts as a **Mirror within a specific region**. It only affects the "upstream subgraph" defined by one or more **Scope Nodes**.

### How it works
1. **Scope Definition:** One or more nodes in the target are designated as scope nodes.
2. **Upstream Subgraph:** The system identifies all nodes reachable by traversing edges *backwards* from the scope nodes (ancestors).
3. **Targeted Mirror:** Only this identified subgraph in the target is replaced by the corresponding elements from the source. Everything in the target outside this scope remains untouched.

### Example with 3 Panels
1. **Panel A (Source):** Contains a large complex graph.
2. **Panel B (Intermediate):** Focuses only on the "Authentication" feature. Node `AuthRoot` is set as a scope node.
3. **Panel C (Other):** Contains unrelated "UI" logic.

When merging from **Panel A** to **Panel B** using **Scoped** strategy:
- Only `AuthRoot` and its ancestors are updated/mirrored in Panel B.
- If Panel B contains other nodes (e.g., experimental nodes added manually), they are preserved if they are not part of the `AuthRoot` upstream subgraph.

## None

The **None** strategy disables the merge operation.

- **Behavior:** The merge button remains visible in the UI but performing the click action results in no changes to the target panel.
- **Use Case:** Temporarily "locking" a panel to prevent accidental overwrites during sensitive editing.

## Quick Reference Table

| Strategy | Deletions in Target? | Scope | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Mirror** | Yes (Full) | Entire Graph | Full synchronization with source. |
| **Push** | No | Entire Graph | Additive aggregation of changes. |
| **Scoped** | Yes (Partial) | Upstream Subgraph | Targeted updates to specific features. |
| **None** | No | N/A | Preventing any incoming changes. |
