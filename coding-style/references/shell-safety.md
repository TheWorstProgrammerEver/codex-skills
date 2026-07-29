# Shell Input And Path Safety

## Allowlist Validation

- Treat Bash `case` patterns as globs, not regular expressions. In a pattern such as `[a-z_][a-z0-9_-]*`, the final `*` matches any suffix; it does not repeat the preceding character class.
- Bracket ranges such as `[a-z]` follow the active locale's collation rules. When the contract requires ASCII, establish C/POSIX semantics for the match (or enumerate the permitted ASCII characters) instead of relying on the host locale or Bash's `globasciiranges` setting.
- Express an allowlist with separate structural checks. For an ASCII lowercase account name that starts with a letter or underscore and otherwise permits letters, digits, underscores, and hyphens:

  ```bash
  validate_account_name() {
    local LC_ALL=C

    case "$1" in
      ""|[!a-z_]*|*[!a-z0-9_-]*) return 1 ;;
      *) return 0 ;;
    esac
  }
  ```

- Probe both accepted boundaries and adversarial rejections. Include unexpected separators or punctuation such as `ab/evil`, `ab.upper`, and `ab:evil`, plus empty input, a disallowed first character, the shortest valid value, uppercase ASCII, and non-ASCII letters under an available non-C locale.

## Trusted Path Boundaries

- For privileged or destructive scripts, reject non-canonical user-supplied path components before deriving relative paths or trusted roots: internal empty segments, `.`, and `..`. A trusted-looking prefix does not make a suffix such as `/Volumes/Backup/../Other/image.dmg` safe.
- Canonicalize every existing user-supplied source or destination path with a platform-appropriate resolver before computing containment, mount, device, free-space, or same-device guard metadata. This also resolves symlinks and mount aliases.
- Derive guard metadata from the complete canonical path that the operation will actually read or write, not from a string prefix such as the first `/Volumes/<name>` components. Verify containment by path component rather than by string prefix.
- Use that same checked canonical value for the eventual read or write. Fail closed when it cannot be resolved safely. For a destination that does not exist yet, canonicalize and check its existing parent before appending a separately validated basename.
- Add targeted rejection probes for traversal and normalization cases such as `/Volumes/Backup/../Other/image.dmg`, `/Volumes/Backup/./image.dmg`, and `/Volumes/Backup//image.dmg`; include a symlink fixture when the script promises to reject or contain symlinked paths.
