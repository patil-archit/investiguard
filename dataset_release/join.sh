#!/usr/bin/env sh
# Rebuild data/shopsim.db from the compressed parts and check it against SHA256SUMS.
set -e
cd "$(dirname "$0")"
mkdir -p ../data
cat shopsim.db.xz.part-* | xz -d > ../data/shopsim.db
cd ../data && shasum -a 256 -c ../dataset_release/SHA256SUMS
echo "data/shopsim.db is ready"
