# ecomwithai handoff

`ecomwithai.bundle` is a complete git repository — the open-source framework
extracted from this project, with **its own history**. It contains no reference
to chillmypet, and none of this repository's commits.

It lives here only because this session could not create the GitHub repository
itself (the GitHub App lacks repo-creation permission), and an unpushed
container is not a safe place to leave work.

## Publishing it

```sh
git clone .handoff/ecomwithai.bundle ecomwithai
cd ecomwithai
npm install && npm test          # 100 assertions, offline

# create an empty public repo named ecomwithai, then:
git remote set-url origin git@github.com:<you>/ecomwithai.git
git push -u origin main
```

Delete this directory afterwards. Nothing here belongs in the storefront repo
long-term.

## Verifying before you publish

```sh
grep -ri 'chillmypet\|floatpaw\|aquapaw' ecomwithai/   # expect no matches
git -C ecomwithai log --oneline                        # expect only its own commits
```
