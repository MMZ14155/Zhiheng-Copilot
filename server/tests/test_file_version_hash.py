import unittest

from app.services.version_hash import VersionHashService

EXPECTED_VERSION_HASH = "86156954273825de16c9715ae2b7f2fd25a7e236de25b844499c19e07b87a7f4"
EXPECTED_BUNDLE_HASH = "24580147acbc64e55ba39734f5d2a9fb58b22537e96539d3f1d9ab4ea2ccd0e2"


class TestVersionHashAgainstFrontend(unittest.TestCase):
    def test_hash_against_frontend_known_output(self):
        vh = VersionHashService.generate_version_hash(
            [{"name": "b.txt", "content": b"beta"}, {"name": "a.txt", "content": b"alpha"}],
            "uploader-1",
            "init upload",
        )
        self.assertEqual(vh, EXPECTED_VERSION_HASH)

    def test_bundle_hash(self):
        files = [{"name": "b.txt", "content": b"beta"}, {"name": "a.txt", "content": b"alpha"}]
        sorted_files = sorted(files, key=lambda f: f["name"])
        single = [VersionHashService.hash_single_file(f["name"], f["content"]) for f in sorted_files]
        self.assertEqual(VersionHashService._sha256("".join(single)), EXPECTED_BUNDLE_HASH)

    def test_content_hex(self):
        self.assertEqual(VersionHashService._content_to_hex(b"alpha"), "616c706861")
        self.assertEqual(VersionHashService._content_to_hex(b"beta"), "62657461")

    def test_sort_order(self):
        s = sorted([{"name": "b.txt"}, {"name": "a.txt"}], key=lambda f: f["name"])
        self.assertEqual(s[0]["name"], "a.txt")


if __name__ == "__main__":
    unittest.main()
