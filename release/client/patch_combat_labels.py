"""Recover official English combat artwork without changing gameplay prefabs.

Inputs are owned CN resources and the official EN 1.0.9 OBB. Only compressed
status-label texture slices and one fight-atlas entry change. No image pixels
are redrawn or re-encoded; the official ETC2 buffers are copied verbatim.
"""
from pathlib import Path
import copy
import hashlib
import io
import json
import struct

import asset_tools as w

SOURCE_SHA = {
    'at/mat.u': '6c9a1188e7d746cc46476ce3019422e1a578633cdb1042f3913f4746ad2e1274',
    'ui_tx/ui_fight.u': '78d6814a2e048c1baa991c6950b7e5c723df2260f69195b21fe9047c14c98996',
}
DONOR_SHA = {
    'at/mat1.u': 'd7324cc21116fd65dc8d688b84fa17b670b82e0a67c7ca2e72af7fd6a4d16bac',
    'at/mat2.u': 'd6238f9199c8690b96082408a8746493297e87dc7167f4ab9cebdf2383ec3692',
    'ui_tx/ui_fight.u': '951ae662de36b240f5a5e7f712158f08fdf8fb2bddb8b0c29312f1174eb88881',
}
COMBO_SPRITE = 'Fight_text_kill_Mul'
LAYOUT_FIELDS = ('m_Width', 'm_Height', 'm_TextureFormat', 'm_MipCount',
                 'm_CompleteImageSize', 'm_ImageCount', 'm_TextureDimension')


def sha(body):
    return hashlib.sha256(body).hexdigest()


def checked(body, expected):
    if sha(body) != expected:
        raise ValueError('Combat label input differs from the reviewed source/donor')
    return body


def load(body):
    meta, raw, encrypted, plain = w.decode(body)
    env = w.UnityPy.load(plain)
    asset, = env.assets
    return meta, raw, encrypted, env, asset


def bundle(meta, raw, encrypted):
    plain = w.pack(meta, raw)
    result = w.transform(plain) if encrypted else plain
    after, verified, flag, _ = w.decode(result)
    assert flag == encrypted and verified == raw and after['nodes'] == meta['nodes']
    return result


def node_for_stream(meta, stream):
    name = stream['path'].rsplit('/', 1)[-1]
    node, = [n for n in meta['nodes'] if n[3] == name]
    assert stream['offset'] >= 0 and stream['offset'] + stream['size'] <= node[1]
    return node


def patch_status(source, donor1, donor2):
    meta, raw, encrypted, _, asset = load(source)
    donors = [load(body)[4] for body in (donor1, donor2)]
    textures = {o.peek_name(): o for o in asset.objects.values()
                if o.type.name == 'Texture2D' and o.peek_name().startswith('e_ui_fight_')}
    assert len(textures) == 53
    candidates = {}
    for donor in donors:
        for obj in donor.objects.values():
            if obj.type.name == 'Texture2D' and obj.peek_name() in textures:
                candidates.setdefault(obj.peek_name(), []).append(obj)
    assert set(candidates) == set(textures)
    changed = bytearray(raw)
    spans = []
    proof = []
    for name, obj in sorted(textures.items()):
        tree = obj.read_typetree()
        donor_objects = candidates[name]
        bodies = [o.read().get_image_data() for o in donor_objects]
        assert all(body == bodies[0] for body in bodies), ('Conflicting EN copies', name)
        for other in donor_objects:
            donor_tree = other.read_typetree()
            assert all(tree.get(k) == donor_tree.get(k) for k in LAYOUT_FIELDS), name
        stream = tree['m_StreamData']
        assert not tree['image data'] and stream['size'] == len(bodies[0])
        node = node_for_stream(meta, stream)
        at = node[0] + stream['offset']
        end = at + stream['size']
        before = raw[at:end]
        assert before == obj.read().get_image_data()
        changed[at:end] = bodies[0]
        spans.append((at, end))
        proof.append({'name': name, 'pathId': obj.path_id, 'width': tree['m_Width'],
                      'height': tree['m_Height'], 'textureFormat': tree['m_TextureFormat'],
                      'compressedBytes': stream['size'], 'changed': before != bodies[0],
                      'officialCompressedSha256': sha(bodies[0])})
    cursor = 0
    for start, end in sorted(spans):
        assert cursor <= start and raw[cursor:start] == changed[cursor:start]
        cursor = end
    assert raw[cursor:] == changed[cursor:]
    result = bundle(meta, bytes(changed), encrypted)
    _, _, _, _, output = load(result)
    # Full object payload comparison proves materials, particle references and
    # every texture's size/format/stream address remain exactly as supplied.
    assert set(output.objects) == set(asset.objects)
    assert all(obj.get_raw_data() == output.objects[pid].get_raw_data()
               for pid, obj in asset.objects.items())
    for name, obj in textures.items():
        assert output.objects[obj.path_id].read().get_image_data() == candidates[name][0].read().get_image_data()
    return result, {'sourceSha256': sha(source), 'outputSha256': sha(result),
                    'labelTextureCount': len(proof),
                    'changedLabelTextures': sum(p['changed'] for p in proof),
                    'all53LabelBuffersMatchOfficialEnglish': True,
                    'allSerializedObjectsByteExact': True,
                    'allBytesOutsideLabelStreamRangesExact': True,
                    'sourceNodeNamesOffsetsAndSizesUnchanged': True,
                    'textureDimensionsFormatAndMipmapsUnchanged': True,
                    'labels': proof}


def add_native_object(raw, path_id, type_id):
    """Add one object record in existing metadata padding; keep data offsets.

    This is the same bounded metadata operation as the existing partial-atlas
    translator. Every existing native object record is preserved verbatim.
    """
    metadata_size, total, version, data_offset = struct.unpack_from('>4I', raw)
    assert version == 17 and total == len(raw)
    stream = io.BytesIO(raw)
    stream.seek(20)
    while stream.read(1) != b'\0':
        pass
    _, has_tree, count = struct.unpack('<i?i', stream.read(9))
    for _ in range(count):
        class_id, _, _ = struct.unpack('<i?h', stream.read(7))
        if class_id == 114:
            stream.read(16)
        stream.read(16)
        if has_tree:
            nodes, chars = struct.unpack('<ii', stream.read(8))
            stream.seek(stream.tell() + nodes * 24 + chars)
    count_at = stream.tell()
    count, = struct.unpack('<i', stream.read(4))
    first = (stream.tell() + 3) // 4 * 4
    end = first + count * 20
    metadata_end = 20 + metadata_size
    assert metadata_end + 20 <= data_offset and not any(raw[metadata_end:data_offset])
    records = [raw[p:p+20] for p in range(first, end, 20)]
    assert path_id not in {struct.unpack_from('<q', row)[0] for row in records}
    records.append(struct.pack('<qIIi', path_id, len(raw) - data_offset, 0, type_id))
    records.sort(key=lambda row: struct.unpack_from('<q', row)[0])
    metadata = (raw[20:count_at] + struct.pack('<i', count + 1) + raw[count_at+4:first]
                + b''.join(records) + raw[end:metadata_end])
    header = bytearray(raw[:20])
    struct.pack_into('>I', header, 0, len(metadata))
    result = bytes(header) + metadata + bytes(data_offset-20-len(metadata)) + raw[data_offset:]
    assert len(result) == len(raw)
    _, before = w.serialized_objects(raw)
    _, after = w.serialized_objects(result)
    assert {(o['path_id'], o['start'], o['size'], o['class_id']) for o in before} == {
        (o['path_id'], o['start'], o['size'], o['class_id']) for o in after if o['path_id'] != path_id}
    return result


def render_key(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def one_object(asset, kind, name=None):
    obj, = [o for o in asset.objects.values()
            if o.type.name == kind and (name is None or o.peek_name() == name)]
    return obj


def patch_combo(source, donor):
    meta, raw, encrypted, _, asset = load(source)
    donor_meta, donor_raw, _, _, official = load(donor)
    assert not asset.externals and not official.externals
    assert {t.class_id: t.old_type_hash for t in asset.types} == {
        t.class_id: t.old_type_hash for t in official.types}
    source_sprite = one_object(asset, 'Sprite', COMBO_SPRITE)
    donor_sprite = one_object(official, 'Sprite', COMBO_SPRITE)
    sprite_tree = source_sprite.read_typetree()
    donor_sprite_tree = donor_sprite.read_typetree()
    assert source_sprite.path_id == donor_sprite.path_id
    assert all(sprite_tree[k] == donor_sprite_tree[k] for k in (
        'm_Rect', 'm_Pivot', 'm_PixelsToUnits', 'm_RenderDataKey', 'm_SpriteAtlas'))
    source_atlas = one_object(asset, 'SpriteAtlas')
    donor_atlas = one_object(official, 'SpriteAtlas')
    assert source_atlas.path_id == donor_atlas.path_id
    atlas_tree = source_atlas.read_typetree()
    official_tree = donor_atlas.read_typetree()
    key = render_key(sprite_tree['m_RenderDataKey'])
    official_entry, = [v for k, v in official_tree['m_RenderDataMap'] if render_key(k) == key]
    texture_id = official_entry['texture']['m_PathID']
    donor_texture = official.objects[texture_id]
    assert donor_texture.type.name == 'Texture2D' and texture_id not in asset.objects
    texture_tree = donor_texture.read_typetree()
    source_texture = one_object(asset, 'Texture2D')
    assert all(source_texture.read_typetree().get(k) == texture_tree.get(k) for k in LAYOUT_FIELDS)
    source_stream = source_texture.read_typetree()['m_StreamData']
    source_node = node_for_stream(meta, source_stream)
    donor_data = donor_texture.read().get_image_data()
    assert not texture_tree['image data'] and texture_tree['m_StreamData']['size'] == len(donor_data)
    original_resources = raw[source_node[0]:source_node[0]+source_node[1]]
    texture_tree = copy.deepcopy(texture_tree)
    texture_tree['m_StreamData'] = {'path': source_stream['path'],
                                   'offset': len(original_resources), 'size': len(donor_data)}
    changed_atlas = copy.deepcopy(atlas_tree)
    changed_atlas['m_RenderDataMap'] = [
        (k, copy.deepcopy(official_entry) if render_key(k) == key else v)
        for k, v in atlas_tree['m_RenderDataMap']]
    bundle_object = one_object(asset, 'AssetBundle')
    bundle_tree = bundle_object.read_typetree()
    original_paths = copy.deepcopy(bundle_tree['m_Container'])
    old_preload_count = len(bundle_tree['m_PreloadTable'])
    assert {p['m_PathID'] for p in bundle_tree['m_PreloadTable']} == set(asset.objects)-{bundle_object.path_id}
    bundle_tree['m_PreloadTable'].append({'m_FileID': 0, 'm_PathID': texture_id})
    for _, entry in bundle_tree['m_Container']:
        assert entry['preloadIndex'] == 0 and entry['preloadSize'] == old_preload_count
        entry['preloadSize'] += 1
    serialized_node, = [n for n in meta['nodes'] if n[2] & 4]
    assert serialized_node[0] == 0 and len(meta['nodes']) == 2
    serialized = raw[:serialized_node[1]]
    texture_type, = [i for i, t in enumerate(asset.types) if t.class_id == 28]
    added = add_native_object(serialized, texture_id, texture_type)
    replacements = {source_atlas.path_id: source_atlas.save_typetree(changed_atlas),
                    bundle_object.path_id: bundle_object.save_typetree(bundle_tree),
                    texture_id: donor_texture.save_typetree(texture_tree)}
    changed_serialized = w.repack_objects(added, replacements)
    resources = original_resources + donor_data
    nodes = [(0, len(changed_serialized), serialized_node[2], serialized_node[3]),
             (len(changed_serialized), len(resources), source_node[2], source_node[3])]
    result = bundle({**meta, 'nodes': nodes}, changed_serialized + resources, encrypted)
    _, _, _, _, output = load(result)
    assert set(output.objects) == set(asset.objects) | {texture_id}
    changed_ids = {source_atlas.path_id, bundle_object.path_id}
    for pid, obj in asset.objects.items():
        if pid not in changed_ids:
            assert output.objects[pid].get_raw_data() == obj.get_raw_data()
    verified_atlas = output.objects[source_atlas.path_id].read_typetree()
    source_entries = dict((render_key(k), v) for k, v in atlas_tree['m_RenderDataMap'])
    output_entries = dict((render_key(k), v) for k, v in verified_atlas['m_RenderDataMap'])
    assert set(source_entries) == set(output_entries)
    assert all(source_entries[k] == output_entries[k] for k in source_entries if k != key)
    # Decode every sprite: the requested label equals the official English
    # pixels, and all other original icons and labels are preserved exactly.
    checked_sprites = 0
    for pid, obj in asset.objects.items():
        if obj.type.name != 'Sprite':
            continue
        before = donor_sprite if pid == source_sprite.path_id else obj
        image = output.objects[pid].read().image
        expected = before.read().image
        assert image.size == expected.size and image.tobytes() == expected.tobytes(), obj.peek_name()
        checked_sprites += 1
    for pid, obj in output.objects.items():
        for ptr in w.pointers(obj.read_typetree()):
            assert ptr['m_FileID'] == 0 and (ptr['m_PathID'] == 0 or ptr['m_PathID'] in output.objects)
    return result, {'sourceSha256': sha(source), 'outputSha256': sha(result),
                    'spriteName': COMBO_SPRITE, 'sourceLabel': 'Chinese combo/kill label',
                    'officialEnglishLabel': 'KILL', 'unchangedSpritePixelChecks': checked_sprites-1,
                    'targetPixelsMatchOfficialEnglish': True, 'noImagePixelsRedrawnOrReencoded': True,
                    'allOriginalSpritePayloadsAndMeshesByteExact': True,
                    'onlyOneAtlasRenderEntryChanged': True, 'oneOfficialTextureAdded': texture_id,
                    'allOriginalTextureBuffersPreserved': True, 'allPPtrsResolve': True,
                    'allOriginalPublicPathsAndIdsPreserved': len(original_paths)}


def build(source_at_mat, donor_mat1, donor_mat2, source_ui_fight, donor_ui_fight):
    inputs = (('at/mat.u', source_at_mat, SOURCE_SHA),
              ('at/mat1.u', donor_mat1, DONOR_SHA), ('at/mat2.u', donor_mat2, DONOR_SHA),
              ('ui_tx/ui_fight.u', source_ui_fight, SOURCE_SHA),
              ('ui_tx/ui_fight.u', donor_ui_fight, DONOR_SHA))
    for name, body, hashes in inputs:
        checked(body, hashes[name])
    status, status_proof = patch_status(source_at_mat, donor_mat1, donor_mat2)
    combo, combo_proof = patch_combo(source_ui_fight, donor_ui_fight)
    return {'at/mat.u': status, 'ui_tx/ui_fight.u': combo}, {
        'method': 'Official English compressed texture buffers; source gameplay objects preserved',
        'status': status_proof, 'combo': combo_proof,
        'runtimeRenderingVerified': False,
        'limitations': ['Static texture decoding and exact asset graph checks do not replace an in-game playtest.']}
