import test from 'node:test';
import assert from 'node:assert/strict';
import {bookCredentialError} from '../app/api/ledger/book-credentials.ts';
test('book names accept one character and names beyond the old 40 character limit',()=>{for(const name of ['가','이름'.repeat(1000),'내 기록장 ✨'])assert.equal(bookCredentialError(name,'123456789',true),null);});
test('new passwords need nine characters and existing credentials still open',()=>{assert.ok(bookCredentialError('기록장','12345678',true));assert.equal(bookCredentialError('기록장','123456789',true),null);assert.equal(bookCredentialError('기록장','legacy',false),null);assert.ok(bookCredentialError('','123456789',true));assert.ok(bookCredentialError('기록장','x'.repeat(129),true));});
