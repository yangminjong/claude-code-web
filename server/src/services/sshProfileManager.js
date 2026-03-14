import { getDb } from '../db/connection.js';
import { encryptCredential, decryptCredential } from '../utils/crypto.js';
import { auditLog } from './auditLogger.js';

export function createProfile(userId, { name, host, port = 22, username, authMethod = 'key', credential, allowedPaths = [] }) {
  const db = getDb();

  const { encrypted, iv, tag } = encryptCredential(credential);

  const result = db.prepare(`
    INSERT INTO ssh_profiles (user_id, name, host, port, username, auth_method, encrypted_credential, credential_iv, credential_tag, allowed_paths)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, name, host, port, username, authMethod, encrypted, iv, tag, JSON.stringify(allowedPaths));

  auditLog(userId, 'ssh_profile_create', { profileId: result.lastInsertRowid, name, host });

  return getProfile(result.lastInsertRowid, userId);
}

export function getProfiles(userId) {
  return getDb().prepare(
    'SELECT id, user_id, name, host, port, username, auth_method, allowed_paths, is_active, last_connected_at, created_at, updated_at FROM ssh_profiles WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC'
  ).all(userId);
}

export function getProfile(profileId, userId) {
  return getDb().prepare(
    'SELECT id, user_id, name, host, port, username, auth_method, allowed_paths, fingerprint, is_active, last_connected_at, created_at, updated_at FROM ssh_profiles WHERE id = ? AND user_id = ? AND is_active = 1'
  ).get(profileId, userId);
}

export function getProfileWithCredential(profileId, userId) {
  const profile = getDb().prepare(
    'SELECT * FROM ssh_profiles WHERE id = ? AND user_id = ? AND is_active = 1'
  ).get(profileId, userId);

  if (!profile) return null;

  const credential = decryptCredential(
    profile.encrypted_credential,
    profile.credential_iv,
    profile.credential_tag
  );

  return { ...profile, credential };
}

export function updateProfile(profileId, userId, updates) {
  const db = getDb();
  const existing = getProfile(profileId, userId);
  if (!existing) return null;

  const fields = [];
  const values = [];

  for (const key of ['name', 'host', 'port', 'username', 'auth_method']) {
    if (updates[key] !== undefined) {
      fields.push(`${key === 'auth_method' ? 'auth_method' : key} = ?`);
      values.push(updates[key]);
    }
  }

  if (updates.allowedPaths !== undefined) {
    fields.push('allowed_paths = ?');
    values.push(JSON.stringify(updates.allowedPaths));
  }

  if (updates.credential) {
    const { encrypted, iv, tag } = encryptCredential(updates.credential);
    fields.push('encrypted_credential = ?', 'credential_iv = ?', 'credential_tag = ?');
    values.push(encrypted, iv, tag);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(profileId, userId);

  db.prepare(
    `UPDATE ssh_profiles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...values);

  auditLog(userId, 'ssh_profile_update', { profileId, changes: Object.keys(updates) });

  return getProfile(profileId, userId);
}

export function deleteProfile(profileId, userId) {
  const db = getDb();
  const profile = getProfile(profileId, userId);
  if (!profile) return null;

  db.prepare('UPDATE ssh_profiles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .run(profileId, userId);

  auditLog(userId, 'ssh_profile_delete', { profileId, name: profile.name });
  return profile;
}

export function updateLastConnected(profileId) {
  getDb().prepare('UPDATE ssh_profiles SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?').run(profileId);
}

export function updateFingerprint(profileId, fingerprint) {
  getDb().prepare('UPDATE ssh_profiles SET fingerprint = ? WHERE id = ?').run(fingerprint, profileId);
}

export function validateRemotePath(profile, requestedPath) {
  const allowedPaths = JSON.parse(profile.allowed_paths || '[]');
  if (allowedPaths.length === 0) return true;
  return allowedPaths.some(base => requestedPath === base || requestedPath.startsWith(base + '/'));
}
