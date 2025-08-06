'use server'

import { getNylasAuthorizationUrl } from './nylas';

export async function getGoogleAuthUrl() {
    try {
        return await getNylasAuthorizationUrl('google');
    } catch (error) {
        console.error('Error getting Google auth URL:', error);
        throw error;
    }
}

export async function getMicrosoftAuthUrl() {
    try {
        return await getNylasAuthorizationUrl('microsoft');
    } catch (error) {
        console.error('Error getting Microsoft auth URL:', error);
        throw error;
    }
} 