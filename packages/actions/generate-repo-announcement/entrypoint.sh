#!/bin/bash
set -euo pipefail

OUTPUT_PATH=${1:-.repo-announcement.json}

echo "🔍 Fetching GitHub repo metadata for $GITHUB_REPOSITORY..."

curl -s -H "Authorization: token $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     "https://api.github.com/repos/$GITHUB_REPOSITORY" > repo.json

echo "📝 Writing announcement to $OUTPUT_PATH..."

cat <<EOF > "$OUTPUT_PATH"
{
  "repository": {
    "full_name": "$(jq -r .full_name repo.json)",
    "html_url": "$(jq -r .html_url repo.json)",
    "description": "$(jq -r .description repo.json | sed 's/"/\\"/g')",
    "name": "$(jq -r .name repo.json)",
    "clone_url": "$(jq -r .clone_url repo.json)"
  }
}
EOF

echo "✅ Done. JSON saved to $OUTPUT_PATH"
