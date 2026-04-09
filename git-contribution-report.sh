#!/usr/bin/env bash

SINCE="1 week ago"
UNTIL="now"

echo "Git Contribution Report"
echo "From: $SINCE to $UNTIL"
echo "-----------------------------------"

# Get unique authors safely (no CRLF issues, no heredoc tricks)
authors=$(git log --since="$SINCE" --until="$UNTIL" --format='%aN' | sort -u)

echo "$authors" | while IFS= read -r author; do
    echo ""
    echo "==================================="
    echo "Author: $author"
    echo "==================================="

    # Commit count
    commit_count=$(git log --since="$SINCE" --until="$UNTIL" --author="$author" --oneline | wc -l)
    echo "Commits: $commit_count"

    echo ""
    echo "Commit Messages:"

    git log --since="$SINCE" --until="$UNTIL" --author="$author" \
        --pretty=format:"- %s"

    echo ""
    echo ""
    echo "Files Changed + Line Stats:"

    git log --since="$SINCE" --until="$UNTIL" --author="$author" \
        --numstat --pretty=format:"" | awk '
    NF==3 {
        added += $1
        removed += $2
        files[$3]++
    }
    END {
        print "Total lines added:", (added+0)
        print "Total lines removed:", (removed+0)
        print ""
        print "Files touched:"
        for (f in files) {
            print "-", f, "(" files[f] " changes)"
        }
    }'

done