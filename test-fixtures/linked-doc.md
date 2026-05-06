---
title: Linked Document
date: 2026-05-06
---

# Linked Document

This is a secondary markdown file used to verify internal-link navigation between
documents. If you can read this after clicking the link from the showcase doc,
the link router resolved a relative `.md` path correctly.

## Why this exists

The viewer treats relative markdown links as in-app navigations rather than
hard navigations. That keeps the SPA shell mounted (theme, sidebar state,
scroll-spy listeners) and just swaps the rendered content.

## A short paragraph

The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor
jugs. How vexingly quick daft zebras jump! Sphinx of black quartz, judge my vow.

[Back to showcase](./showcase.md)
