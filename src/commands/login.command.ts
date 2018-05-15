import * as program from 'commander';
import * as readline from 'readline-sync';

import { TwoFactorProviderType } from 'jslib/enums/twoFactorProviderType';

import { AuthResult } from 'jslib/models/domain/authResult';
import { TwoFactorEmailRequest } from 'jslib/models/request/twoFactorEmailRequest';

import { ApiService } from 'jslib/abstractions/api.service';
import { AuthService } from 'jslib/abstractions/auth.service';

import { Response } from '../models/response';

export class LoginCommand {
    constructor(private authService: AuthService, private apiService: ApiService) { }

    async run(email: string, password: string, cmd: program.Command) {
        if (email == null || email === '') {
            email = readline.question('Email address: ');
        }
        if (email == null || email.trim() === '') {
            return Response.badRequest('Email address is required.');
        }
        if (email.indexOf('@') === -1) {
            return Response.badRequest('Email address is invalid.');
        }

        if (password == null || password === '') {
            password = readline.question('Master password: ', {
                hideEchoBack: true,
                mask: '*',
            });
        }
        if (password == null || password === '') {
            return Response.badRequest('Master password is required.');
        }

        let twoFactorToken: string = cmd.code;
        let twoFactorMethod: TwoFactorProviderType = null;
        try {
            if (cmd.method != null) {
                twoFactorMethod = parseInt(cmd.method, null);
            }
        } catch (e) {
            return Response.error('Invalid two-step login method.');
        }

        try {
            let response: AuthResult = null;
            if (twoFactorToken != null && twoFactorMethod != null) {
                response = await this.authService.logInComplete(email, password, twoFactorMethod,
                    twoFactorToken, false);
            } else {
                response = await this.authService.logIn(email, password);
                if (response.twoFactor) {
                    let selectedProvider: any = null;
                    const twoFactorProviders = this.authService.getSupportedTwoFactorProviders(null);
                    if (twoFactorProviders.length === 0) {
                        return Response.badRequest('No providers available for this client.');
                    }

                    if (twoFactorMethod != null) {
                        try {
                            selectedProvider = twoFactorProviders.filter((p) => p.type === twoFactorMethod)[0];
                        } catch (e) {
                            return Response.error('Invalid two-step login method.');
                        }
                    }

                    if (selectedProvider == null) {
                        if (twoFactorProviders.length === 1) {
                            selectedProvider = twoFactorProviders[0];
                        } else {
                            const options = twoFactorProviders.map((p) => p.name);
                            const i = readline.keyInSelect(options, 'Two-step login method: ', { cancel: 'Cancel' });
                            if (i < 0) {
                                return Response.error('Login failed.');
                            }
                            selectedProvider = twoFactorProviders[i];
                        }
                    }

                    if (twoFactorToken == null && response.twoFactorProviders.size > 1 &&
                        selectedProvider.type === TwoFactorProviderType.Email) {
                        const emailReq = new TwoFactorEmailRequest(this.authService.email,
                            this.authService.masterPasswordHash);
                        await this.apiService.postTwoFactorEmail(emailReq);
                    }

                    if (twoFactorToken == null) {
                        twoFactorToken = readline.question('Two-step login code for ' + selectedProvider.name + ': ');
                        if (twoFactorToken == null || twoFactorToken === '') {
                            return Response.badRequest('Code is required.');
                        }
                    }

                    const twoFactorResponse = await this.authService.logInTwoFactor(selectedProvider.type,
                        twoFactorToken, false);
                    if (twoFactorResponse.twoFactor) {
                        return Response.error('Login failed.');
                    }
                }
            }
            return Response.success();
        } catch (e) {
            return Response.error(e);
        }
    }
}
