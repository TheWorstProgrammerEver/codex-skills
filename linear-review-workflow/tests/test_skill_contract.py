from __future__ import annotations

import re
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
DELIVERY_GRAPH_FIXTURE = (
    SKILL_ROOT / "references" / "delivery-graph-fixture.md"
).read_text(encoding="utf-8")


def fixture_edges(graph_name: str) -> set[tuple[str, str]]:
    match = re.search(
        rf"### {re.escape(graph_name)} graph\n\n```text\n(?P<edges>.*?)```",
        DELIVERY_GRAPH_FIXTURE,
        re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"Missing {graph_name} graph fixture")

    return {
        tuple(part.strip() for part in line.split("->", maxsplit=1))
        for line in match.group("edges").splitlines()
        if line.strip()
    }


def graph_nodes(edges: set[tuple[str, str]]) -> set[str]:
    return {node for edge in edges for node in edge}


def reachable(edges: set[tuple[str, str]], start: str, end: str) -> bool:
    frontier = [start]
    visited: set[str] = set()

    while frontier:
        node = frontier.pop()
        if node == end:
            return True
        if node in visited:
            continue

        visited.add(node)
        frontier.extend(consumer for producer, consumer in edges if producer == node)

    return False


def is_acyclic(edges: set[tuple[str, str]]) -> bool:
    return not any(reachable(edges - {edge}, edge[1], edge[0]) for edge in edges)


def graph_boundaries(edges: set[tuple[str, str]]) -> tuple[set[str], set[str]]:
    nodes = graph_nodes(edges)
    producers = {producer for producer, _ in edges}
    consumers = {consumer for _, consumer in edges}
    return nodes - consumers, nodes - producers


def is_redundant(edges: set[tuple[str, str]], edge: tuple[str, str]) -> bool:
    return reachable(edges - {edge}, *edge)


class LinearReviewWorkflowContractTest(unittest.TestCase):
    def test_review_reply_and_resolution_are_separate_boundaries(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("GraphQL `resolveReviewThread` mutation", SKILL)
        self.assertIn("separate authorization boundaries", SKILL)
        self.assertIn("exact minted token permission set", compact_skill)
        self.assertIn("does not prove authority", SKILL)
        self.assertIn("`pull_requests:write`", SKILL)
        self.assertIn("`issues:write`", SKILL)
        self.assertIn("`contents:write`", SKILL)

    def test_resolution_success_requires_authoritative_state_read(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("Treat `viewerCanResolve` as advisory", SKILL)
        self.assertIn("After any `resolveReviewThread` attempt", SKILL)
        self.assertIn("verify `isResolved: true`", SKILL)
        self.assertIn("before claiming resolution", SKILL)
        self.assertIn("mutation reports success but the authoritative re-read", compact_skill)

    def test_forbidden_integration_path_fails_closed_without_identity_switch(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("integration `FORBIDDEN`", SKILL)
        self.assertIn("`Resource not accessible by integration`", SKILL)
        self.assertIn("leave the thread unresolved", SKILL)
        self.assertIn("without retrying through a different GitHub identity", SKILL)
        self.assertIn("authorized collaborator resolves the specific threads manually", compact_skill)

    def test_reusable_content_contains_no_private_host_identity(self) -> None:
        private_home_paths = ("/" + "home" + "/", "/" + "Users" + "/")
        for private_identity in (*private_home_paths, "private-host.internal"):
            self.assertNotIn(private_identity, SKILL)
            self.assertNotIn(private_identity, DELIVERY_GRAPH_FIXTURE)

    def test_delivery_graph_guidance_names_required_review_concepts(self) -> None:
        guidance = f"{SKILL}\n{DELIVERY_GRAPH_FIXTURE}".lower()

        for concept in (
            "decision gate",
            "consumer/producer edge",
            "operational owner",
            "schema lifecycle owner",
            "bounded collections",
            "production cutover",
        ):
            self.assertIn(concept, guidance)

        self.assertIn("code, documentation, operational implementation", guidance)
        self.assertIn("post-deploy certification", guidance)
        self.assertIn("redundant edge", guidance)

    def test_defective_graph_is_acyclic_but_semantically_incomplete(self) -> None:
        edges = fixture_edges("Defective")
        nodes = graph_nodes(edges)

        self.assertTrue(is_acyclic(edges))
        self.assertEqual(({"foundation"}, {"certify"}), graph_boundaries(edges))
        self.assertFalse(reachable(edges, "events", "ui"))
        self.assertNotIn("decision-gate", nodes)
        self.assertNotIn("runner", nodes)
        self.assertNotIn("deploy", nodes)
        self.assertTrue(is_redundant(edges, ("api", "certify")))
        self.assertIn("forward-referenced cascade", DELIVERY_GRAPH_FIXTURE)
        self.assertIn("unbounded secondary collection", DELIVERY_GRAPH_FIXTURE)
        self.assertIn("missing deployment owner", DELIVERY_GRAPH_FIXTURE)

    def test_corrected_graph_orders_delivery_from_decision_to_certification(self) -> None:
        edges = fixture_edges("Corrected")

        self.assertTrue(is_acyclic(edges))
        self.assertEqual(({"decision-gate"}, {"certify"}), graph_boundaries(edges))
        self.assertTrue(reachable(edges, "events", "ui"))
        self.assertTrue(reachable(edges, "audit-schema", "api"))
        self.assertTrue(reachable(edges, "runner", "deploy"))
        self.assertTrue(reachable(edges, "deploy", "certify"))
        self.assertFalse(any(is_redundant(edges, edge) for edge in edges))


if __name__ == "__main__":
    unittest.main()
