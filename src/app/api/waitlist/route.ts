import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json()

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Nombre y email son requeridos' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    await resend.emails.send({
      from: 'The Lab Pilates <noreply@thelabpilatesstudio.com.mx>',
      to: 'thelabpilates77@gmail.com',
      subject: `Nueva inscripción en lista de espera: ${name}`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px;">
          <h2 style="font-family: 'Playfair Display', serif; color: #2A2A2A; margin-bottom: 24px;">
            Nueva persona en la lista de espera
          </h2>
          <div style="background: #F9F8F6; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px 0; color: #4c463e;">
              <strong>Nombre:</strong> ${name}
            </p>
            <p style="margin: 0; color: #4c463e;">
              <strong>Email:</strong> ${email}
            </p>
          </div>
          <p style="color: #7e766d; font-size: 14px;">
            Esta persona se registró en la lista de espera de The Lab Pilates Studio.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json(
      { error: 'Error al enviar. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
