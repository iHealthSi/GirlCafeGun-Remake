"""Use existing ASCII glyphs for English dialogue punctuation.

The active locale remains zh_CN. Only English narrative values are touched:
keys, resource references, non-Latin dialogue, tags and control characters stay
as supplied. Font binaries, accents and icon/emoticon glyphs are not changed.
"""
import copy
import re
import struct
from collections import Counter

import asset_tools as w

NARRATIVE_KEY = re.compile(r'^(?:main\.|solo\d+\.|topicinfo\.|_StoryMsg\.)')
NON_LATIN = re.compile(r'[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]')
TAG = re.compile(r'(<[^>]*>)')
PUNCTUATION = {
    '\u2018': "'", '\u2019': "'",
    '\u201c': '"', '\u201d': '"',
    '\u2013': '-', '\u2014': '--', '\u2026': '...',
}
TRANSLATE = str.maketrans(PUNCTUATION)


def normalize(key, text):
    """Return narrative prose with a small explicit punctuation substitution."""
    if not NARRATIVE_KEY.match(key) or NON_LATIN.search(text):
        return text
    parts = TAG.split(text)
    # Markup is opaque, including quotes in attributes; icon glyphs remain as-is.
    body = ''.join(parts[::2])
    if not re.search(r'[A-Za-z]', body):
        return text
    return ''.join(part if i % 2 else part.translate(TRANSLATE)
                   for i, part in enumerate(parts))


def build_language(source):
    meta, raw, encrypted, _ = w.decode(source)
    assert not encrypted
    table = w.typed_tables(raw, {'zh_CN'})['zh_CN']
    before = table['value']
    assert len(before['keys']) == len(before['values'])
    value = copy.deepcopy(before)
    changed_keys, characters = [], Counter()
    for i, (key, old) in enumerate(zip(before['keys'], before['values'])):
        new = normalize(key, old)
        if old == new:
            continue
        assert TAG.findall(new) == TAG.findall(old)
        assert [c for c in new if c.isspace()] == [c for c in old if c.isspace()]
        assert re.findall(r'%[^\s%]*[%sdif]|\\[nrt]', new) == re.findall(r'%[^\s%]*[%sdif]|\\[nrt]', old)
        value['values'][i] = new
        changed_keys.append(key)
        for part in TAG.split(old)[::2]:
            characters.update(c for c in part if c in PUNCTUATION)
    assert value['keys'] == before['keys']
    # Compact the changed dictionary, retaining every other serialized object.
    offset, objects = w.serialized_objects(raw)
    target = table['object']['path_id']
    payload = w.replace_native(raw, table, value)
    output = bytearray(raw[:offset])
    for obj in sorted(objects, key=lambda obj: obj['start']):
        body = payload if obj['path_id'] == target else raw[obj['start']:obj['start'] + obj['size']]
        output += bytes(-len(output) % 8)
        at = len(output)
        output += body
        struct.pack_into('<II', output, obj['record'] + 8, at - offset, len(body))
    struct.pack_into('>I', output, 4, len(output))
    output = bytes(output)
    assert len(meta['nodes']) == 1
    _, _, flags, cab = meta['nodes'][0]
    result = w.pack({**meta, 'nodes': [(0, len(output), flags, cab)]}, output)
    _, checked, check_encrypted, _ = w.decode(result)
    assert not check_encrypted
    assert w.typed_tables(checked, {'zh_CN'})['zh_CN']['value'] == value
    _, after_objects = w.serialized_objects(checked)
    by_id = {o['path_id']: o for o in after_objects}
    assert set(by_id) == {o['path_id'] for o in objects}
    for old in objects:
        if old['path_id'] == target:
            continue
        new = by_id[old['path_id']]
        assert raw[old['start']:old['start'] + old['size']] == checked[new['start']:new['start'] + new['size']]
    return result, {
        'localeIdentityUnchanged': 'zh_CN',
        'translationKeysUnchanged': True,
        'englishNarrativeValuesAdjusted': len(changed_keys),
        'changedKeys': changed_keys,
        'punctuationReplacements': {f'U+{ord(c):04X}': n for c, n in sorted(characters.items())},
        'tagsWhitespaceAndControlsPreserved': True,
        'otherLanguageObjectsByteExact': True,
        'nativeDictionaryRoundtripExact': True,
        'fontBinariesUnchanged': True,
        'scope': 'main, solo, phone-topic and story-message English dialogue only',
        'runtimeRenderingVerified': False,
    }
