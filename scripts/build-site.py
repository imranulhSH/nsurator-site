#!/usr/bin/env python3
"""Extract the two bundled pages once, then build editable HTML with local assets.

Python standard library only. Never reads or writes privacy.html or CNAME.
"""

import argparse
import base64
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent
PAGES = ("index.html", "support.html")
UUID = re.compile(r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b")
ASSET_URL = re.compile(r"/assets/([A-Za-z0-9._-]+)")
EXTENSIONS = {
    "application/javascript": ".js",
    "text/javascript": ".js",
    "text/css": ".css",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
}
MANIFEST = ROOT / "src" / "asset-manifest.json"
BOOT_START = "<!-- Local resource map: keep before the DC runtime. -->"
BOOT_END = "<!-- End local resource map. -->"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


class BundleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = None
        self.parts = {}

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            kind = dict(attrs).get("type", "")
            if kind.startswith("__bundler/"):
                if kind in self.parts:
                    raise ValueError("Duplicate bundle section: " + kind)
                self.active = kind
                self.parts[kind] = []

    def handle_endtag(self, tag):
        if tag == "script":
            self.active = None

    def handle_data(self, data):
        if self.active:
            self.parts[self.active].append(data)

    def section(self, kind):
        key = "__bundler/" + kind
        if key not in self.parts:
            raise ValueError("Missing bundle section: " + key)
        return json.loads("".join(self.parts[key]))


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.imports = []
        self.asset_refs = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.scripts.append(attrs)
        if tag == "x-import":
            self.imports.append(attrs)
        for value in attrs.values():
            if value:
                self.asset_refs.update(ASSET_URL.findall(value))


def extract_bundles():
    """One-time import. Refuse to overwrite editable sources."""
    targets = [ROOT / "src" / name for name in PAGES] + [MANIFEST]
    existing = [str(path.relative_to(ROOT)) for path in targets if path.exists()]
    if existing:
        raise ValueError("Extraction would overwrite editable sources: " + ", ".join(existing))

    sources = {}
    assets = {}
    metadata = {"schema_version": 1, "asset_url_prefix": "/assets/", "pages": {}, "assets": {}}
    for name in PAGES:
        raw = (ROOT / name).read_bytes()
        parser = BundleParser()
        parser.feed(raw.decode("utf-8"))
        template = parser.section("template")
        manifest = parser.section("manifest")
        externals = parser.section("ext_resources")
        page_order = parser.section("page_order")
        if not isinstance(template, str) or not isinstance(manifest, dict):
            raise ValueError(name + ": unsupported bundle structure")
        if page_order:
            raise ValueError(name + ": nested bundled pages require a separate extraction strategy")

        resource_map = {}
        uuid_to_asset = {}
        for uid, entry in manifest.items():
            if not UUID.fullmatch(uid):
                raise ValueError(name + ": invalid asset UUID " + uid)
            mime = entry["mime"].split(";", 1)[0].strip().lower()
            if mime not in EXTENSIONS:
                raise ValueError(name + ": unsupported asset MIME " + mime)
            content = base64.b64decode(entry["data"], validate=True)
            if entry.get("compressed"):
                content = gzip.decompress(content)
            digest = sha256(content)
            filename = digest + EXTENSIONS[mime]
            # A hash names the original decoded bytes, without rewriting vendor code.
            if filename in assets and assets[filename] != content:
                raise ValueError("Asset hash collision: " + filename)
            assets[filename] = content
            asset = metadata["assets"].setdefault(filename, {
                "sha256": digest, "bytes": len(content), "mime_types": [], "origins": [],
            })
            if mime not in asset["mime_types"]:
                asset["mime_types"].append(mime)
            asset["origins"].append({"page": name, "uuid": uid})
            resource_map[uid] = "/assets/" + filename
            uuid_to_asset[uid] = filename

        unknown = set(UUID.findall(template)) - set(manifest)
        if unknown:
            raise ValueError(name + ": template references missing UUIDs: " + ", ".join(sorted(unknown)))
        # Current assets have no nested bundle UUID dependencies. Do not silently
        # preserve broken references if a future export changes that assumption.
        for uid, filename in uuid_to_asset.items():
            mime = manifest[uid]["mime"]
            if "javascript" in mime or mime.startswith("text/") or "svg" in mime:
                found = set(UUID.findall(assets[filename].decode("utf-8"))) & set(manifest)
                if found:
                    raise ValueError(name + ": nested UUID dependencies in " + uid)

        external_map = {}
        for external in externals:
            uid = external["uuid"]
            if uid not in resource_map:
                raise ValueError(name + ": missing external resource " + uid)
            external_map[external["id"]] = resource_map[uid]
        resource_map.update(external_map)
        normalized = UUID.sub(lambda match: resource_map[match.group()], template)
        first_script = re.search(r"<script\b", normalized, re.IGNORECASE)
        if not first_script:
            raise ValueError(name + ": missing DC runtime script")
        bootstrap = (
            BOOT_START + "\n<script data-local-resources>\nwindow.__resources = "
            + json.dumps(resource_map, ensure_ascii=False, indent=2, sort_keys=True).replace("<", "\\u003c")
            + ";\n</script>\n" + BOOT_END + "\n"
        )
        normalized = normalized[:first_script.start()] + bootstrap + normalized[first_script.start():]
        sources[name] = normalized
        metadata["pages"][name] = {
            "original_bundle_bytes": len(raw),
            "original_bundle_sha256": sha256(raw),
            "original_template_bytes": len(template.encode("utf-8")),
            "original_template_sha256": sha256(template.encode("utf-8")),
            "initial_source_sha256": sha256(normalized.encode("utf-8")),
            "uuid_to_asset": uuid_to_asset,
            "external_resources": external_map,
        }

    # Validate the entire import before creating any source files.
    for filename, content in assets.items():
        target = ROOT / "assets" / filename
        if target.exists() and target.read_bytes() != content:
            raise ValueError("Existing asset differs: " + str(target))
    (ROOT / "src").mkdir(parents=True, exist_ok=True)
    (ROOT / "assets").mkdir(parents=True, exist_ok=True)
    for filename, content in sorted(assets.items()):
        (ROOT / "assets" / filename).write_bytes(content)
    for name, content in sources.items():
        (ROOT / "src" / name).write_text(content, encoding="utf-8")
    MANIFEST.write_text(json_text(metadata), encoding="utf-8")


def validate_sources():
    metadata = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if metadata.get("schema_version") != 1:
        raise ValueError("Unsupported asset manifest version")
    generated_assets = {}
    generated_sources = {}
    motion_path = ROOT / "src" / "motion.js"
    motion_url = None
    if motion_path.is_file():
        motion = motion_path.read_bytes()
        motion_name = sha256(motion) + ".js"
        motion_url = "/assets/" + motion_name
        generated_assets[motion_name] = motion
        generated_sources[motion_name] = "src/motion.js"
    pages = {}
    needed = set()
    for name in PAGES:
        content = (ROOT / "src" / name).read_bytes()
        source = content.decode("utf-8")
        if "__SITE_MOTION__" in source:
            if motion_url is None:
                raise ValueError(name + ": __SITE_MOTION__ requires src/motion.js")
            for quote in ('"', "'"):
                source = source.replace("src=" + quote + "__SITE_MOTION__" + quote,
                                        "src=" + quote + motion_url + quote)
            if "__SITE_MOTION__" in source:
                raise ValueError(name + ": use the motion placeholder as src=\"__SITE_MOTION__\"")
            content = source.encode("utf-8")
        if "__bundler/" in source or "DecompressionStream" in source:
            raise ValueError(name + ": source still contains the outer bundle loader")
        parser = PageParser()
        parser.feed(source)
        if parser.imports:
            raise ValueError(name + ": x-import was not present in this export; bundle its dependencies explicitly")
        # The independent motion helper may precede the map, but the original
        # DC/React scripts must see it before they execute.
        runtime_scripts = [attrs for attrs in parser.scripts if not (motion_url and attrs.get("src") == motion_url)]
        if not runtime_scripts or "data-local-resources" not in runtime_scripts[0]:
            raise ValueError(name + ": local resource map must run before the DC runtime")
        for attrs in parser.scripts:
            src = attrs.get("src", "")
            if src and not src.startswith("/assets/"):
                raise ValueError(name + ": external script dependency: " + src)
        references = set(ASSET_URL.findall(source))
        for external_url, local_url in metadata["pages"][name]["external_resources"].items():
            if json.dumps(external_url) + ": " + json.dumps(local_url) not in source:
                raise ValueError(name + ": missing local runtime mapping for " + external_url)
        if set(UUID.findall(source)) - set(metadata["pages"][name]["uuid_to_asset"]):
            raise ValueError(name + ": unknown bundle UUID in source")
        for match in UUID.finditer(source):
            # UUID keys retained in the bootstrap are intentional; the body must
            # use deployable asset URLs rather than bundle-only references.
            if match.start() > source.find(BOOT_END):
                raise ValueError(name + ": unresolved bundle UUID in page content")
        needed.update(references)
        pages[name] = content

    assets = {}
    for filename in sorted(needed):
        if filename in generated_assets:
            assets[filename] = generated_assets[filename]
            continue
        path = ROOT / "assets" / filename
        if filename not in metadata["assets"]:
            raise ValueError("Asset not in source manifest: " + filename)
        content = path.read_bytes()
        expected = metadata["assets"][filename]
        if sha256(content) != expected["sha256"] or len(content) != expected["bytes"]:
            raise ValueError("Asset integrity check failed: " + filename)
        if not filename.startswith(expected["sha256"] + "."):
            raise ValueError("Asset filename must match its content hash: " + filename)
        assets[filename] = content

    original_bytes = sum(metadata["pages"][name]["original_bundle_bytes"] for name in PAGES)
    page_bytes = sum(len(data) for data in pages.values())
    asset_bytes = sum(len(data) for data in assets.values())
    original_asset_count = sum(len(metadata["pages"][name]["uuid_to_asset"]) for name in PAGES)
    per_page_assets = {
        name: set(ASSET_URL.findall(data.decode("utf-8"))) for name, data in pages.items()
    }
    repeated_asset_bytes = sum(sum(len(assets[n]) for n in refs) for refs in per_page_assets.values())
    report = {
        "original_bundles_bytes": original_bytes,
        "html_bytes": page_bytes,
        "unique_asset_bytes": asset_bytes,
        "output_bytes_excluding_report": page_bytes + asset_bytes,
        "raw_bytes_saved": original_bytes - page_bytes - asset_bytes,
        "raw_size_reduction_percent": round(100 * (original_bytes - page_bytes - asset_bytes) / original_bytes, 2),
        "original_asset_entries": original_asset_count,
        "unique_asset_files": len(assets),
        "generated_assets": {
            filename: {"source": generated_sources[filename], "sha256": sha256(data), "bytes": len(data)}
            for filename, data in assets.items() if filename in generated_sources
        },
        "shared_asset_bytes_saved_across_pages": repeated_asset_bytes - asset_bytes,
        "gzip_estimate_bytes": sum(len(gzip.compress(data, mtime=0)) for data in list(pages.values()) + list(assets.values())),
        "gzip_estimate_note": "Estimate only; the build does not produce precompressed files or configure the server.",
        "pages": {
            name: {
                "html_bytes": len(data),
                "assets": sorted(per_page_assets[name]),
                "standalone_bytes": len(data) + sum(len(assets[n]) for n in per_page_assets[name]),
                "sha256": sha256(data),
            }
            for name, data in pages.items()
        },
        "preserved_runtime": "Original DC runtime and vendor assets; no outer gzip/base64 loader.",
        "omitted_by_design": ["privacy.html", "CNAME", "server configuration"],
    }
    return pages, assets, report


def build(out, pages, assets, report):
    out = out.resolve()
    protected = [ROOT / "src", ROOT / "assets", ROOT / "scripts"]
    if out == ROOT or any(out == path or path in out.parents or out in path.parents for path in protected):
        raise ValueError("Output must be a separate build directory, not the repository root or source directories")
    out.mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(exist_ok=True)
    for name, data in pages.items():
        (out / name).write_bytes(data)
    for filename, data in assets.items():
        (out / "assets" / filename).write_bytes(data)
    (out / "build-report.json").write_text(json_text(report), encoding="utf-8")
    # No directory removal, no glob copy from the repository root, and no access
    # to the independently maintained privacy page or domain/server settings.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extract-bundles", action="store_true", help="One-time import of root index/support bundles; refuses to overwrite src")
    parser.add_argument("--out", type=Path, help="Output directory for HTML, assets and build-report.json")
    parser.add_argument("--check", action="store_true", help="Validate editable sources and asset integrity without writing build output")
    args = parser.parse_args()
    if not args.out and not args.check:
        parser.error("Specify --out DIRECTORY or --check")
    try:
        if args.extract_bundles:
            extract_bundles()
        pages, assets, report = validate_sources()
        if args.out:
            build(args.out, pages, assets, report)
        print(json_text({key: value for key, value in report.items() if key not in ("pages",)}), end="")
        if args.out:
            print("Built: " + str(args.out.resolve()))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Build failed: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
