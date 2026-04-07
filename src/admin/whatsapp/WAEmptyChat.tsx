import { motion } from 'motion/react';
import { MessageCircle } from 'lucide-react';

export default function WAEmptyChat() {
  return (
    <div className="wa2-empty-chat">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="wa2-empty-content">
        <div className="wa2-empty-icon">
          <MessageCircle className="w-10 h-10" />
        </div>
        <h3 className="wa2-empty-title">WhatsApp Inbox</h3>
        <p className="wa2-empty-desc">Selecione uma conversa para iniciar o atendimento.</p>
      </motion.div>
    </div>
  );
}
