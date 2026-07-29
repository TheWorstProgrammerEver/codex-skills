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

- For privileged or destructive scripts, reject non-canonical user-supplied path components before deriving relative paths or trusted roots: internal empty segments, `.`, and `..`. A trusted-looking prefix does not make a suffix such as `/Volumes/Backup/../Other/image.dmg` safe.
- Canonicalize every existing user-supplied source or destination path with a platform-appropriate resolver before computing containment, mount, device, free-space, or same-device guard metadata. This also resolves symlinks and mount aliases.
- Derive guard metadata from the complete canonical path that the operation will actually read or write, not from a string prefix such as the first `/Volumes/<name>` components. Verify containment by path component rather than by string prefix.
- Use that same checked canonical value for the eventual read or write. Fail closed when it cannot be resolved safely. For a destination that does not exist yet, canonicalize and check its existing parent before appending a separately validated basename.
- Add targeted rejection probes for traversal and normalization cases such as `/Volumes/Backup/../Other/image.dmg`, `/Volumes/Backup/./image.dmg`, and `/Volumes/Backup//image.dmg`; include a symlink fixture when the script promises to reject or contain symlinked paths.
