"""ezdxf audit of the DXF 2018 export (test step only, not part of the app).

    pip install ezdxf matplotlib
    npx vitest run tests/dxfExport.test.ts      # writes output/dxf-verification/*.dxf
    python tools/qa/dxf_audit.py [folder]    # audit + entity counts + PNG of Model and every Layout

Exit code 1 when a file cannot be read or the audit reports an error. A summary is written to
<folder>/audit.json; the PNGs sit next to the files (<name>-Model.png, <name>-<layout>.png).
"""
import io
import json
import sys
from collections import Counter
from pathlib import Path

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.config import BackgroundPolicy, ColorPolicy, Configuration
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def render(doc, layout, png: Path, size=(16.5, 11.7)):
    fig = plt.figure(figsize=size)
    ax = fig.add_axes([0, 0, 1, 1])
    cfg = Configuration(background_policy=BackgroundPolicy.WHITE, color_policy=ColorPolicy.COLOR)
    ctx = RenderContext(doc)
    Frontend(ctx, MatplotlibBackend(ax), config=cfg).draw_layout(layout, finalize=True)
    fig.savefig(png, dpi=110)
    plt.close(fig)


def main(folder: Path) -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    files = sorted(folder.glob("*.dxf"))
    if not files:
        print(f"no DXF files in {folder}")
        return 1
    report, failed = {}, False
    for f in files:
        try:
            doc = ezdxf.readfile(f)
        except Exception as e:  # unreadable file = failure
            print(f"{f.name}: READ ERROR {e}")
            report[f.name] = {"read": str(e)}
            failed = True
            continue
        auditor = doc.audit()
        errors = [str(e.message) for e in auditor.errors]
        fixes = [str(e.message) for e in auditor.fixes]
        msp = doc.modelspace()
        by_type = Counter(e.dxftype() for e in msp)
        by_layer = Counter(e.dxf.layer for e in msp)
        layouts = {}
        for name in doc.layouts.names_in_taborder():
            if name == "Model":
                continue
            lay = doc.layouts.get(name)
            vps = [e for e in lay if e.dxftype() == "VIEWPORT" and e.dxf.id != 1]
            layouts[name] = {"entities": len(lay), "viewports": len(vps),
                             "scales": [round(v.dxf.view_height / v.dxf.height, 3) for v in vps]}
        report[f.name] = {"version": doc.dxfversion, "errors": errors, "fixes": fixes, "modelspace": dict(by_type),
                          "layers": dict(by_layer), "layouts": layouts, "dimstyles": [d.dxf.name for d in doc.dimstyles],
                          "blocks": [b.name for b in doc.blocks if not b.name.startswith("*")]}
        status = "OK" if not errors else f"{len(errors)} ERRORS"
        print(f"{f.name}: {doc.dxfversion} {status} · fixes {len(fixes)} · model {sum(by_type.values())} · layouts {len(layouts)}")
        for e in errors[:10]:
            print("   error:", e)
        for e in fixes[:5]:
            print("   fix:", e)
        failed |= bool(errors)
        stem = f.stem
        render(doc, msp, folder / f"{stem}-Model.png")
        for name in layouts:
            render(doc, doc.layouts.get(name), folder / f"{stem}-{name}.png")
    (folder / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "output/dxf-verification")))
