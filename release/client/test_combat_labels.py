"""Resource regression check using owned source ZIP and official English OBB.

This decodes real target/donor assets and checks output graphics and graph
invariants. It does not connect to a device or package a release APK.
"""
from pathlib import Path
import argparse
import json
import zipfile

import patch_combat_labels as patch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-zip', type=Path, required=True)
    parser.add_argument('--donor-obb', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    with zipfile.ZipFile(args.source_zip) as source, zipfile.ZipFile(args.donor_obb) as donor:
        inputs = (source.read('files/at/mat.u'), donor.read('assets/at/mat1.u'),
                  donor.read('assets/at/mat2.u'), source.read('files/ui_tx/ui_fight.u'),
                  donor.read('assets/ui_tx/ui_fight.u'))
    for i in range(len(inputs)):
        wrong = list(inputs)
        wrong[i] = b'not the reviewed artifact'
        try:
            patch.build(*wrong)
        except ValueError:
            pass
        else:
            raise AssertionError('Unreviewed source/donor was accepted')
    print('All five altered source/donor inputs rejected', flush=True)
    files, proof = patch.build(*inputs)
    assert set(files) == {'at/mat.u', 'ui_tx/ui_fight.u'}
    assert proof['status']['all53LabelBuffersMatchOfficialEnglish']
    assert proof['combo']['targetPixelsMatchOfficialEnglish']
    assert proof['combo']['onlyOneAtlasRenderEntryChanged']
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        file = out/'files'/name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(body)
        assert file.read_bytes() == body
    # Save only a few read-only decoded comparisons for human inspection.
    for label, body in (('CN', inputs[0]), ('EN', files['at/mat.u'])):
        asset = patch.load(body)[4]
        for obj in asset.objects.values():
            if obj.type.name == 'Texture2D' and obj.peek_name() in {
                    'e_ui_fight_dizziness_Mul', 'e_ui_fight_DOT_Burning02_Mul'}:
                obj.read().image.save(out/(obj.peek_name()+'-'+label+'.png'))
    for label, body in (('CN', inputs[3]), ('EN', files['ui_tx/ui_fight.u'])):
        obj = patch.one_object(patch.load(body)[4], 'Sprite', patch.COMBO_SPRITE)
        obj.read().image.save(out/('combat-counter-'+label+'.png'))
    (out/'combat-labels-proof.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'output': str(out), 'statusLabels': proof['status']['labelTextureCount'],
                      'changedStatusLabels': proof['status']['changedLabelTextures'],
                      'counter': proof['combo']['officialEnglishLabel'],
                      'preservedOtherSprites': proof['combo']['unchangedSpritePixelChecks']}), flush=True)


if __name__ == '__main__':
    main()
