import hashlib
import logging

logger = logging.getLogger(__name__)


class VersionHashService:
    """复现 FileFlow.ts 中 generateVersionHash 算法"""

    @staticmethod
    def _sha256(data: str) -> str:
        return hashlib.sha256(data.encode("utf-8")).hexdigest()

    @staticmethod
    def _content_to_hex(content: bytes) -> str:
        return content.hex()

    @staticmethod
    def hash_single_file(name: str, content: bytes) -> str:
        return VersionHashService._sha256(f"{name}:{VersionHashService._content_to_hex(content)}")

    @staticmethod
    def generate_version_hash(files: list[dict], uploaded_by: str, changelog: str) -> str:
        sorted_files = sorted(files, key=lambda f: f["name"])
        single_hashes = [
            VersionHashService.hash_single_file(f["name"], f["content"]) for f in sorted_files
        ]
        bundle_hash = VersionHashService._sha256("".join(single_hashes))
        return VersionHashService._sha256(f"{bundle_hash}:{uploaded_by}:{changelog}")
