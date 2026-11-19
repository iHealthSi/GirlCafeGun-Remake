"""Regression checks for narrative controls and actual active-locale roundtrip."""
from pathlib import Path
import argparse
import json
import struct
import sys
import zipfile

import patch_prose_punctuation as p
import asset_tools as w


def cmap_glyph(data, codepoint):
    """Read the supplied font's Unicode cmap4 without requiring font libraries."""
    count = struct.unpack_from('>H', data, 4)[0]
    tables = {data[12 + 16*i:16 + 16*i]: struct.unpack_from('>II', data, 20 + 16*i)
              for i in range(count)}
    start = tables[b'cmap'][0]
    n = struct.unpack_from('>H', data, start + 2)[0]
    for i in range(n):
        platform, encoding, relative = struct.unpack_from('>HHI', data, start + 4 + 8*i)
        sub = start + relative
        if platform not in (0, 3) or struct.unpack_from('>H', data, sub)[0] != 4:
            continue
        segments = struct.unpack_from('>H', data, sub + 6)[0] // 2
        ends = sub + 14
        starts = ends + segments*2 + 2
        deltas = starts + segments*2
        offsets = deltas + segments*2
        for j in range(segments):
            low = struct.unpack_from('>H', data, starts + j*2)[0]
            high = struct.unpack_from('>H', data, ends + j*2)[0]
            if not low <= codepoint <= high:
                continue
            delta = struct.unpack_from('>h', data, deltas + j*2)[0]
            distance = struct.unpack_from('>H', data, offsets + j*2)[0]
            if not distance:
                return (codepoint + delta) & 0xffff
            glyph = struct.unpack_from('>H', data, offsets + j*2 + distance + (codepoint - low)*2)[0]
            return ((glyph + delta) & 0xffff) if glyph else 0
    return 0


def run(source_apk=None):
    # A dialogue line may contain engine markup, escaped waits, icon glyphs,
    # indentation and accented names alongside the punctuation being repaired.
    old = '  “Renée’s here…”\n<color=“kept”>Wait—don’t!</color> %s \\n \ue001'
    expected = '  "Renée\'s here..."\n<color=“kept”>Wait--don\'t!</color> %s \\n \ue001'
    assert p.normalize('main.intro', old) == expected
    assert p.normalize('main.intro', expected) == expected
    for key, value in [
        ('ui.DOT_Burning', 'Particle/other/“do-not-touch”'),
        ('main.intro', '她说：“Manager…”'),
        ('main.intro', '「こんにちは…」 Manager'),
        ('main.intro', '“…” \ue001'),
        ('item.name', '“Renée’s”'),
    ]:
        assert p.normalize(key, value) == value
    result = {'dialogueControlsAndMarkupPreserved': True,
              'nonEnglishResourcesAndIconGlyphsPreserved': True,
              'normalizationIdempotent': True}
    if source_apk:
        import UnityPy
        source_apk = Path(source_apk)
        w.configure(source_apk)
        with zipfile.ZipFile(source_apk) as apk:
            source = apk.read('assets/lang.u')
            output, proof = p.build_language(source)
            assert proof['englishNarrativeValuesAdjusted'] > 0
            _, raw, _, _ = w.decode(source)
            before = w.typed_tables(raw, {'zh_CN'})['zh_CN']['value']
            _, raw, _, _ = w.decode(output)
            after = w.typed_tables(raw, {'zh_CN'})['zh_CN']['value']
            assert before['keys'] == after['keys']
            d = dict(zip(after['keys'], after['values']))
            # These actual opening/main-story lines exposed smart punctuation.
            assert d['main.nstory1002205'] == "It's just as well..."
            assert d['main.nstory1011106'] == "To live in a world where you can survive without becoming stronger--that's the good thing."
            for key, old_value, new_value in zip(before['keys'], before['values'], after['values']):
                assert new_value == p.normalize(key, old_value)
            fonts = []
            for member in ['assets/font/fzzchjw_ttf.u']:
                env = UnityPy.load(apk.read(member))
                font = next(o for o in env.objects if o.type.name == 'Font').read_typetree()
                data = bytes(font['m_FontData'])
                fonts.append({'font': font['m_Name'],
                    'asciiAllPresent': all(cmap_glyph(data, c) for c in range(32, 127)),
                    'punctuationGlyphs': {f'U+{ord(c):04X}': cmap_glyph(data, ord(c)) for c in p.PUNCTUATION},
                    'meaning': 'Presence is static font coverage; visual style/fallback was not observed.'})
                assert fonts[-1]['asciiAllPresent']
            result.update(actualLocaleRoundtrip=proof, fontCoverage=fonts,
                          actualNarrativeExamplesVerified=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-apk', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = run(args.source_apk)
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding='utf8')
    # Keep the console compact; the report retains every changed key.
    print(json.dumps({k: v for k, v in result.items() if k != 'actualLocaleRoundtrip'}, ensure_ascii=False))
    if 'actualLocaleRoundtrip' in result:
        print('Narrative values adjusted:', result['actualLocaleRoundtrip']['englishNarrativeValuesAdjusted'])
