import type {
  CreateSessionRequest,
  EndSessionRequest,
  TStartRecordingForExistingSessionRequest,
  TPostV1DocumentRequest,
  TPostV1ConvertToTemplateRequest,
  TPatchSessionContextRequest,
  TPatchVoiceApiV2ConfigRequest,
} from '@eka-care/ekascribe-ts-sdk';
import { getSDK } from './sdk-provider';

// --- Session operations ---

export async function createSession(request: CreateSessionRequest, version?: string) {
  return getSDK().sessions.createSession(request, version);
}

export async function getSessionDetails(
  sessionId: string,
  presigned: boolean = true,
  version?: string
) {
  return getSDK().sessions.getSessionDetails({ session_id: sessionId, presigned, version });
}

export async function endSession(request: EndSessionRequest, sessionId?: string) {
  return getSDK().sessions.endSession(request, sessionId);
}

export async function getSessionStatus(sessionId?: string, templateId?: string, version?: string) {
  return getSDK().getSessionStatus(sessionId, { ...(templateId ? { templateId } : {}), version });
}

// --- Recording operations ---

export async function startRecordingForExistingSession(
  request: TStartRecordingForExistingSessionRequest
) {
  return getSDK().startRecordingForExistingSession(request);
}

export function pauseRecording() {
  return getSDK().pauseRecording();
}

export function resumeRecording() {
  return getSDK().resumeRecording();
}

export async function endRecording() {
  return getSDK().endRecording();
}

export async function cancelSession(sessionId?: string) {
  return getSDK().cancelSession(sessionId);
}

export function forceAllowMoreChunks() {
  return getSDK().forceAllowMoreChunks?.();
}

export async function retryUploadRecording() {
  return getSDK().retryUploadRecording();
}

export async function processPreRecordedAudio(request: {
  upload: Record<string, unknown>;
  audioFile: File | Blob;
}) {
  return getSDK().processPreRecordedAudio(request);
}

// --- Chunk transcription ---

export async function getChunkTranscript(txnId: string, chunkNumber: string) {
  return getSDK().getChunkTranscript(txnId, chunkNumber);
}

// --- Document operations ---

export async function createDocument(request: TPostV1DocumentRequest) {
  return getSDK().documents.createDocument(request);
}

export async function updateDocument(request: TPostV1DocumentRequest) {
  return getSDK().documents.updateDocument(request);
}

export async function deleteDocument(documentId: string) {
  return getSDK().documents.deleteDocument(documentId);
}

export async function getDocument(request: { documentId: string; params?: string }) {
  return getSDK().documents.getDocument(request);
}

export async function convertToTemplate(request: { txn_id: string; template_id: string }) {
  return getSDK().documents.convertToTemplate(request);
}

export async function convertTranscriptionToTemplate(request: TPostV1ConvertToTemplateRequest) {
  return getSDK().documents.convertTranscriptionToTemplate(request);
}

// --- Context operations ---

export async function addSessionContext(request: TPatchSessionContextRequest) {
  return getSDK().sessions.addSessionContext(request);
}

export async function removeSessionContext(request: TPatchSessionContextRequest) {
  return getSDK().sessions.removeSessionContext(request);
}

// --- Session history ---

export async function getSessionHistory(params: { txn_count: number; oid?: string }) {
  return getSDK().sessions.getSessionHistory(params);
}

// --- Config operations ---

export async function updateConfig(request: TPatchVoiceApiV2ConfigRequest) {
  return getSDK().sessions.updateConfig(request);
}
