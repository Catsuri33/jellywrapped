# Adds a plugin release to a Jellyfin plugin repository manifest.
# Input: the manifest (an array of plugins). Arguments:
#   $meta     the release's meta.json (from --slurpfile)
#   $url      download URL of the release zip
#   $checksum MD5 of the zip
#   $image    URL of the plugin image
# The release replaces any existing entry with the same version; versions are kept newest first.

$meta[0] as $m
| {
    version: $m.version,
    changelog: $m.changelog,
    targetAbi: $m.targetAbi,
    sourceUrl: $url,
    checksum: $checksum,
    timestamp: $m.timestamp
  } as $release
| (first(.[] | select(.guid == $m.guid)) // { versions: [] }) as $existing
| map(select(.guid != $m.guid)) + [{
    guid: $m.guid,
    name: $m.name,
    description: $m.description,
    overview: $m.overview,
    owner: $m.owner,
    category: $m.category,
    imageUrl: $image,
    versions: ([$release] + ($existing.versions | map(select(.version != $m.version))))
      | sort_by(.version | split(".") | map(tonumber))
      | reverse
  }]
