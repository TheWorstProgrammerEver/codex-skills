# Shell Input And Path Safety

## Allowlist Validation

- Treat Bash `case` patterns as globs, not regular expressions. In a pattern such as `[a-z_][a-z0-9_-]*`, the final `*` matches any suffix; it does not repeat the preceding character class.
- Express an allowlist with separate structural checks. For a lowercase account name that starts with a letter or underscore and otherwise permits letters, digits, underscores, and hyphens:

  ```bash
  case "$account_name" in
    ""|[!a-z_]*|*[!a-z0-9_-]*) reject_account_name ;;
  esac
  ```

- Probe both accepted boundaries and adversarial rejections. Include unexpected separators or punctuation such as `ab/evil`, `ab.upper`, and `ab:evil`, plus empty input, a disallowed first character, and the shortest valid value.

## Trusted Path Boundaries

- Before deriving a trusted mount, disk, or backup root, canonicalize the complete path with a platform-appropriate resolver or reject `..` and symlink components according to the script's contract.
- Perform containment, same-disk, free-space, and destructive-operation checks against the canonical path. Verify containment by path component rather than by string prefix.
- Use that same checked canonical value for the eventual read or write. Do not validate only the first trusted-looking component and later pass an unnormalized suffix to a destructive command.
- Fail closed when a path cannot be resolved safely. For a destination that does not exist yet, resolve and check its existing parent before appending the final basename.
