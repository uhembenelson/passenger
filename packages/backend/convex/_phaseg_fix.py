import io, sys, re

def patch_lib_import(fname, body):
    s = io.open(fname, encoding="utf-8").read()
    m = re.search(r'import \{ ((?:[^{}]*)) \} from "\./lib";', s, re.S)
    if not m:
        print(f"!! {fname}: no single ./lib import block found")
        return False
    inner = m.group(1)
    if "requireTransactionalVerification" in inner:
        print(f"{fname}: already has it, no-op")
        return True
    # char-faithful insert before requireVerified (alphabetical-ish), no dup
    if "requireVerified" in inner:
        newinner = inner.replace("requireVerified", "requireTransactionalVerification, requireVerified", 1)
    else:
        newinner = "requireTransactionalVerification, " + inner
    newrow = 'import { ' + newinner + ' } from "./lib";'
    s = s[:m.start()] + newrow + s[m.end():]
    io.open(fname, "w", encoding="utf-8").write(s)
    print(f"OK {fname}: requireTransactionalVerification added to lib import")
    return True

ok = True
for f in ["marketplace.ts"]:
    ok = patch_lib_import(f, None) and ok
print("DONE")
