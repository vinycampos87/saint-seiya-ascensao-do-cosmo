# Saint Seiya — Ascensão do Cosmo
## Demo web v0.6.1 — Correção de sprites e interface épica

🎮 **[Jogar no navegador](https://vinycampos87.github.io/saint-seiya-ascensao-do-cosmo/)**

Projeto de fã e demonstração de jogo top-down 3/4 com cenário de arena do Santuário em 4K.

### Controles
- **WASD ou setas:** andar nas quatro direções
- **J:** ataque básico (respeita a direção do personagem)
- **K:** Meteoro de Pégaso (45 Cosmo)
- **F:** combate automático
- **G:** alternar partículas
- **Esc:** pausa
- **R:** reiniciar arena (preserva progressão)

### Correções v0.6.1
- Alinhamento dos pés na areia baseado no alpha real de cada quadro do sprite, em vez do fundo transparente da célula.
- Direções corretas para idle, caminhada, ataque e Meteoro.
- Caminhada sincronizada com deslocamento; animação para quando o personagem para.
- Golpe manual não vira o personagem para o inimigo sem comando.
- Interface revisada em azul, bronze e elementos inspirados no Santuário.
- Personagens mais legíveis e escala consistente.
- Enfermaria mantém nível, experiência e Dracmas.
- Teste automatizado real com Chromium via GitHub Actions: `tests/smoke.cjs`.

> **Importante:** esta é uma demonstração web independente em Canvas 2D, não o cliente Phaser/React original. Ainda podem existir limitações de sprites gerados anteriormente.

### Testes e visual
[Ver resultados de testes](https://github.com/vinycampos87/saint-seiya-ascensao-do-cosmo/actions/workflows/test-web.yml)

A captura de QA gerada automaticamente aparece em `preview/arena-v061.jpg` quando a execução termina.

*Saint Seiya / Os Cavaleiros do Zodíaco pertencem aos respectivos titulares de direitos. Projeto de fã não oficial.*
