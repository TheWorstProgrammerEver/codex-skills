# Accessibility

Use this guidance when implementing, testing, or reviewing visible UI, interactive controls, navigation, theming, animation, or document semantics.

## Baseline Expectations

- Support light and dark mode when the product has a user-facing UI.
- Prefer semantic HTML, native controls, and built-in SDK components because they usually carry better accessibility behavior than custom widgets.
- Preserve keyboard navigation, focus order, focus visibility, names, roles, values, labels, and error messaging when changing interactive UI.
- Do not replace native platform behavior with custom controls unless there is a clear product need and the accessible behavior is implemented deliberately.

## Motion And Animation

- Respect platform animation preferences such as reduced motion.
- If the platform or SDK does not natively support motion preferences, include explicit animation modes such as `none` and `minimal` when motion is meaningful.
- Avoid making animation the only way to perceive state changes.

## Validation

- Perform at least a basic WCAG-oriented inspection for new or modified UI concerns.
- For web content, inspect the Accessibility Object Model when practical and compare names, roles, values, and relationships against the intended interaction.
- Validate keyboard-only use for newly introduced controls and workflows.
- Include automated checks when the repository already has accessibility tooling, but do not treat automated checks as a substitute for semantic inspection.
