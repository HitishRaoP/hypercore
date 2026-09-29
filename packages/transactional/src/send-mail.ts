import { env } from './lib/env';
import { Resend } from 'resend';

const resend = new Resend(env.RESEND_API_KEY)

export const sendMail = async (email: string, subject: string, react: React.ReactNode) => {
    await resend.emails.send({
        from: env.FROM_EMAIL,
        to: email,
        subject: subject,
        react,
    });
};
